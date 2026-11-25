import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AppConstantRoute } from '@/app/constants';
import { NavigationPages, PageModule } from '../navigation-pages/navigation-pages';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonDirective } from 'primeng/button';
import { Message } from 'primeng/message';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';

import { PrevisionAction } from '@/app/models/deep-learning-model';
import { DeepLearningService } from '@/app/pages/service/service/deep-learning-service';

// Module 2 du projet Deep Learning : prévision du cours de Merck sur 20 jours avec NeuralProphet.
@Component({
    selector: 'app-prevision',
    standalone: true,
    imports: [NavigationPages, DatePipe, DecimalPipe, ButtonDirective, Message, Skeleton, TableModule, Tag],
    templateUrl: './prevision.html'
})
export class PrevisionComponent implements OnDestroy {
    private service = inject(DeepLearningService);
    private route = inject(ActivatedRoute);

    readonly routes = AppConstantRoute;

    // Les pages du module 2 (une adresse par page : /prevision-merck/<id>)
    readonly pages: PageModule[] = [
        { id: 'prevision', label: 'Prévision', icon: 'pi pi-chart-line' },
        { id: 'fiabilite', label: 'Fiabilité (backtest)', icon: 'pi pi-check-square' },
        { id: 'tableau', label: 'Tableau des 20 jours', icon: 'pi pi-table' }
    ];

    // Page affichée, lue dans l'adresse
    section = toSignal(this.route.paramMap.pipe(map((p) => p.get('section') ?? 'prevision')), { initialValue: 'prevision' });

    constructor() {
        this.charger();                                           // la prévision est calculée une seule fois pour les 3 pages
        // À chaque changement de page (ou de données), on redessine le graphique de la page affichée
        effect(() => {
            const page = this.section();
            const p = this.prevision();
            if (!p || this.chargement()) return;
            setTimeout(() => {                                    // le conteneur du graphique est alors affiché
                if (page === 'prevision') this.dessiner(p);
                if (page === 'fiabilite') this.dessinerBacktest(p);
            });
        });
    }

    @ViewChild('graphique') graphique?: ElementRef<HTMLDivElement>;
    @ViewChild('graphiqueBacktest') graphiqueBacktest?: ElementRef<HTMLDivElement>;
    private chart?: IChartApi;
    private chartBacktest?: IChartApi;
    private observateurTheme?: MutationObserver;

    chargement = signal(true);
    erreur = signal<string | null>(null);
    prevision = signal<PrevisionAction | null>(null);

    // Indicateurs affichés en haut de la page
    prixFinal = computed(() => this.prevision()?.previsions.at(-1)?.prix ?? null);
    variation = computed(() => {
        const p = this.prevision();
        const fin = this.prixFinal();
        return p && fin !== null ? (fin / p.dernier_cours - 1) * 100 : null;
    });
    fourchette = computed(() => {
        const prix = this.prevision()?.previsions.map((x) => x.prix) ?? [];
        return prix.length ? { min: Math.min(...prix), max: Math.max(...prix) } : null;
    });

    // Le modèle fait-il mieux que la référence naïve (dernier prix répété) ?
    gainSurNaif = computed(() => {
        const b = this.prevision()?.backtest;
        return b && b.naif.mae > 0 ? (1 - b.neuralprophet.mae / b.naif.mae) * 100 : null;
    });

    ngOnDestroy(): void {
        this.observateurTheme?.disconnect();
        this.chart?.remove();
        this.chartBacktest?.remove();
    }

    // Jour de la semaine en français (lun., mar.…)
    jourSemaine(date: string): string {
        return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' });
    }

    // Télécharge la prévision des 20 jours au format CSV (ouvrable dans Excel)
    exporterCsv(): void {
        const p = this.prevision();
        if (!p) return;
        const lignes = [
            'jour;date;prix_prevu_usd;ecart_dernier_cours_pct',
            ...p.previsions.map((x) => [`J+${x.jour}`, x.date, x.prix.toFixed(2).replace('.', ','), ((x.prix / p.dernier_cours - 1) * 100).toFixed(2).replace('.', ',')].join(';'))
        ];
        const blob = new Blob(['\ufeff' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' });   // \ufeff : accents lisibles dans Excel
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(blob);
        lien.download = `prevision_${p.action}_${p.derniere_date}.csv`;
        lien.click();
        URL.revokeObjectURL(lien.href);
    }

    charger(): void {
        this.chargement.set(true);
        this.erreur.set(null);
        this.service.getPrevisionMerck().subscribe({
            next: (prevision) => {
                this.prevision.set(prevision);
                this.chargement.set(false);                           // l'effet du constructeur dessine le graphique
            },
            error: (e: HttpErrorResponse) => {
                this.erreur.set(
                    e.status === 0
                        ? "L'API de Machine Learning ne répond pas. Lancez-la avec : python -m uvicorn main:app --port 8001"
                        : (e.error?.detail ?? `Erreur ${e.status}`)
                );
                this.chargement.set(false);
            }
        });
    }

    // ---------- Graphique : historique (bleu) et prévision (orange, en pointillés) ----------

    private dessiner(p: PrevisionAction): void {
        const conteneur = this.graphique?.nativeElement;
        if (!conteneur) return;
        this.chart?.remove();
        this.chart = createChart(conteneur, {
            autoSize: true,
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, rightOffset: 3 },
            localization: { locale: 'fr-FR', priceFormatter: (prix: number) => `${prix.toFixed(2)} $` }
        });
        this.appliquerTheme();

        const historique = this.chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2, title: 'Historique' });
        historique.setData(p.historique.map((x) => ({ time: x.date, value: x.prix })));

        const dernier = p.historique.at(-1);
        const prevision = this.chart.addSeries(LineSeries, {
            color: '#ef6c00',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            title: `Prévision ${p.horizon} j`
        });
        prevision.setData([
            ...(dernier ? [{ time: dernier.date, value: dernier.prix }] : []),   // relie la prévision au dernier prix connu
            ...p.previsions.map((x) => ({ time: x.date, value: x.prix }))
        ]);
        this.chart.timeScale().fitContent();

        // Suit le passage clair / sombre de l'application
        this.observateurTheme?.disconnect();
        this.observateurTheme = new MutationObserver(() => this.appliquerTheme());
        this.observateurTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    // ---------- Graphique du backtest : vrais prix (bleu) et prix prévus (orange) ----------

    private dessinerBacktest(p: PrevisionAction): void {
        const conteneur = this.graphiqueBacktest?.nativeElement;
        if (!conteneur || !p.backtest) return;
        this.chartBacktest?.remove();
        this.chartBacktest = createChart(conteneur, {
            autoSize: true,
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false },
            localization: { locale: 'fr-FR', priceFormatter: (prix: number) => `${prix.toFixed(2)} $` }
        });
        this.appliquerTheme();
        const reel = this.chartBacktest.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2, title: 'Prix réel' });
        reel.setData(p.backtest.points.map((x) => ({ time: x.date, value: x.reel })));
        const prevu = this.chartBacktest.addSeries(LineSeries, { color: '#ef6c00', lineWidth: 2, lineStyle: LineStyle.Dashed, title: 'Prévu' });
        prevu.setData(p.backtest.points.map((x) => ({ time: x.date, value: x.prevu })));
        this.chartBacktest.timeScale().fitContent();
    }

    private appliquerTheme(): void {
        const racine = document.documentElement.classList;
        const sombre = racine.contains('app-dark') || racine.contains('dark');
        const grille = sombre ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
        for (const graphique of [this.chart, this.chartBacktest]) {
            graphique?.applyOptions({
                layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: sombre ? '#b2b5be' : '#5d606b' },
                grid: { vertLines: { color: grille }, horzLines: { color: grille } }
            });
        }
    }
}
