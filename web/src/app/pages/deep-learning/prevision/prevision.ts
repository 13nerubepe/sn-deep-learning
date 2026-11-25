import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
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
    imports: [DatePipe, DecimalPipe, ButtonDirective, Message, Skeleton, TableModule, Tag],
    templateUrl: './prevision.html'
})
export class PrevisionComponent implements AfterViewInit, OnDestroy {
    private service = inject(DeepLearningService);

    @ViewChild('graphique') graphique?: ElementRef<HTMLDivElement>;
    private chart?: IChartApi;
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

    ngAfterViewInit(): void {
        this.charger();
    }

    ngOnDestroy(): void {
        this.observateurTheme?.disconnect();
        this.chart?.remove();
    }

    charger(): void {
        this.chargement.set(true);
        this.erreur.set(null);
        this.service.getPrevisionMerck().subscribe({
            next: (prevision) => {
                this.prevision.set(prevision);
                this.chargement.set(false);
                setTimeout(() => this.dessiner(prevision));      // le conteneur du graphique est alors affiché
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

    private appliquerTheme(): void {
        const racine = document.documentElement.classList;
        const sombre = racine.contains('app-dark') || racine.contains('dark');
        const grille = sombre ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
        this.chart?.applyOptions({
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: sombre ? '#b2b5be' : '#5d606b' },
            grid: { vertLines: { color: grille }, horzLines: { color: grille } }
        });
    }
}
