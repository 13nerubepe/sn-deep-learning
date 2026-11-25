import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonDirective } from 'primeng/button';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';
import { SelectButton } from 'primeng/selectbutton';
import { Dialog } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AppConstantRoute } from '@/app/constants';
import { NavigationPages, PageModule } from '../navigation-pages/navigation-pages';

import { ExempleImage, GraphiqueNotebook, InfoClassification, LigneComparaison, ResultatClassification } from '@/app/models/deep-learning-model';
import { DeepLearningService } from '@/app/pages/service/service/deep-learning-service';

// Module 1 du projet Deep Learning : prédire la maladie de peau présente sur une image.
@Component({
    selector: 'app-classification',
    standalone: true,
    imports: [NavigationPages, DecimalPipe, PercentPipe, DatePipe, FormsModule, ButtonDirective, Message, ProgressBar, Skeleton, Tag, SelectButton, Dialog],
    templateUrl: './classification.html'
})
export class ClassificationComponent implements OnInit, OnDestroy {
    private service = inject(DeepLearningService);
    private route = inject(ActivatedRoute);

    readonly routes = AppConstantRoute;

    // Les pages du module 1 (une adresse par page : /classification-images/<id>)
    readonly pages: PageModule[] = [
        { id: 'prediction', label: 'Prédiction', icon: 'pi pi-image' },
        { id: 'historique', label: 'Historique', icon: 'pi pi-history' },
        { id: 'performance', label: 'Performance', icon: 'pi pi-chart-bar' },
        { id: 'comparaison', label: 'Comparaison des CNN', icon: 'pi pi-table' },
        { id: 'graphiques', label: 'Graphiques', icon: 'pi pi-images' }
    ];

    // Page affichée, lue dans l'adresse
    section = toSignal(this.route.paramMap.pipe(map((p) => p.get('section') ?? 'prediction')), { initialValue: 'prediction' });

    info = signal<InfoClassification | null>(null);           // modèle utilisé
    erreurInfo = signal<string | null>(null);

    // Les 7 critères du notebook (section 9-b), avec une explication simple
    readonly criteres = [
        { cle: 'Accuracy', titre: 'Accuracy', aide: 'Part des images bien classées' },
        { cle: 'Sensibilité macro', titre: 'Sensibilité', aide: 'Retrouve les malades de chaque classe' },
        { cle: 'Spécificité macro', titre: 'Spécificité', aide: 'Évite les fausses alertes' },
        { cle: 'Sensib. pire classe', titre: 'Pire classe', aide: 'Sensibilité de la maladie la moins bien reconnue' },
        { cle: 'F1 macro', titre: 'F1 macro', aide: 'Équilibre précision / rappel, chaque maladie compte autant' },
        { cle: 'MCC', titre: 'MCC', aide: 'Corrélation de Matthews, robuste au déséquilibre (de -1 à 1)' },
        { cle: 'AUROC macro', titre: 'AUROC', aide: 'Qualité des probabilités (0,5 = hasard, 1 = parfait)' }
    ];

    // Critères disponibles sur le test (rien si classes.json est une ancienne version)
    metriquesTest = computed(() => {
        const m = this.info()?.metriques_test ?? {};
        return this.criteres.filter((c) => m[c.cle] !== undefined && m[c.cle] !== null).map((c) => ({ ...c, valeur: m[c.cle] as number }));
    });

    // Sensibilité de chaque maladie sur le test
    rappels = computed(() => Object.entries(this.info()?.rappel_par_classe_test ?? {}).map(([classe, valeur]) => ({ classe, valeur })));

    // Tableau de comparaison des CNN, du meilleur au moins bon
    comparaison = computed<LigneComparaison[]>(() => [...(this.info()?.comparaison ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)));

    fichier = signal<File | null>(null);                       // image choisie
    apercu = signal<string | null>(null);                      // adresse locale de l'image, pour l'afficher
    glisser = signal(false);                                   // une image est glissée au-dessus de la zone

    exemples = signal<ExempleImage[]>([]);                     // images de test du notebook
    graphiques = signal<GraphiqueNotebook[]>([]);              // graphiques du notebook
    graphiqueOuvert = signal<GraphiqueNotebook | null>(null);  // graphique affiché en grand
    vue = signal<'image' | 'gradcam'>('gradcam');              // image d'origine ou carte Grad-CAM
    readonly optionsVue = [
        { label: 'Grad-CAM', value: 'gradcam' },
        { label: 'Image d\'origine', value: 'image' }
    ];
    historique = this.service.historique;                      // prédictions de la visite

    chargement = signal(false);                                // prédiction en cours
    resultat = signal<ResultatClassification | null>(null);
    erreur = signal<string | null>(null);

    ngOnInit(): void {
        this.service.getInfoClassification().subscribe({
            next: (info) => this.info.set(info),
            error: (e: HttpErrorResponse) => this.erreurInfo.set(this.messageErreur(e))
        });
        this.service.getExemples().subscribe({ next: (liste) => this.exemples.set(liste), error: () => this.exemples.set([]) });
        this.service.getGraphiques().subscribe({ next: (liste) => this.graphiques.set(liste), error: () => this.graphiques.set([]) });
    }

    // Adresse complète d'un fichier de l'API (exemple, graphique)
    url(chemin: string): string {
        return this.service.urlFichier(chemin);
    }

    // Essaie une image d'exemple en un clic
    essayerExemple(exemple: ExempleImage): void {
        this.erreur.set(null);
        this.service.telechargerImage(exemple.url).subscribe({
            next: (blob) => this.prendreFichier(new File([blob], exemple.fichier, { type: blob.type || 'image/jpeg' })),
            error: (e: HttpErrorResponse) => this.erreur.set(this.messageErreur(e))
        });
    }

    ngOnDestroy(): void {
        this.libererApercu();
    }

    // ---------- Choix de l'image ----------

    choisirFichier(evenement: Event): void {
        const champ = evenement.target as HTMLInputElement;
        const fichier = champ.files?.[0];
        if (fichier) this.prendreFichier(fichier);
        champ.value = '';                                       // permet de reprendre la même image
    }

    deposer(evenement: DragEvent): void {
        evenement.preventDefault();
        this.glisser.set(false);
        const fichier = evenement.dataTransfer?.files?.[0];
        if (fichier) this.prendreFichier(fichier);
    }

    survoler(evenement: DragEvent, actif: boolean): void {
        evenement.preventDefault();
        this.glisser.set(actif);
    }

    private prendreFichier(fichier: File): void {
        if (!fichier.type.startsWith('image/')) {
            this.erreur.set('Choisissez un fichier image (JPG, PNG…).');
            return;
        }
        this.libererApercu();
        this.fichier.set(fichier);
        this.apercu.set(URL.createObjectURL(fichier));
        this.resultat.set(null);
        this.erreur.set(null);
        this.predire();                                         // la prédiction part tout de suite
    }

    // ---------- Prédiction ----------

    predire(): void {
        const fichier = this.fichier();
        if (!fichier) return;
        this.chargement.set(true);
        this.erreur.set(null);
        this.service.predireImage(fichier).subscribe({
            next: (resultat) => {
                this.resultat.set(resultat);
                this.vue.set(resultat.gradcam ? 'gradcam' : 'image');
                this.chargement.set(false);
                this.ajouterHistorique(fichier, resultat);
            },
            error: (e: HttpErrorResponse) => {
                this.erreur.set(this.messageErreur(e));
                this.chargement.set(false);
            }
        });
    }

    reinitialiser(): void {
        this.libererApercu();
        this.fichier.set(null);
        this.resultat.set(null);
        this.erreur.set(null);
    }

    // Couleur de l'étiquette de confiance
    severite(probabilite: number): 'success' | 'warn' | 'danger' {
        if (probabilite >= 0.7) return 'success';
        if (probabilite >= 0.4) return 'warn';
        return 'danger';
    }

    // Message selon la confiance du modèle
    messageAvis(r: ResultatClassification): { severite: 'success' | 'warn' | 'error'; texte: string } {
        if (r.avis === 'tres_incertain') {
            return { severite: 'error', texte: "Le modèle est très incertain. L'image ne ressemble peut-être à aucune des 5 maladies apprises, ou elle n'est pas assez nette. Ne vous fiez pas à ce résultat." };
        }
        if (r.avis === 'hesitant') {
            return { severite: 'warn', texte: `Le modèle hésite entre ${r.probabilites[0].nom_court} et ${r.probabilites[1].nom_court}. Regardez les deux premières propositions.` };
        }
        return { severite: 'success', texte: 'Le modèle est assez sûr de sa réponse.' };
    }

    // Garde une miniature de l'image et le résultat dans l'historique de la visite
    private ajouterHistorique(fichier: File, r: ResultatClassification): void {
        const lecteur = new FileReader();
        lecteur.onload = () => {
            const image = new Image();
            image.onload = () => {
                const toile = document.createElement('canvas');
                const cote = 96;                                          // miniature 96 × 96
                toile.width = cote;
                toile.height = cote;
                const ctx = toile.getContext('2d');
                if (!ctx) return;
                const echelle = Math.max(cote / image.width, cote / image.height);
                const l = image.width * echelle;
                const h = image.height * echelle;
                ctx.drawImage(image, (cote - l) / 2, (cote - h) / 2, l, h);
                const entree = { miniature: toile.toDataURL('image/jpeg', 0.8), nom: fichier.name, classe: r.prediction.nom_court, probabilite: r.prediction.probabilite, heure: new Date() };
                this.historique.update((liste) => [entree, ...liste].slice(0, 12));   // 12 dernières prédictions
            };
            image.src = lecteur.result as string;
        };
        lecteur.readAsDataURL(fichier);
    }

    viderHistorique(): void {
        this.historique.set([]);
    }

    // Couleur d'une valeur de critère (entre 0 et 1)
    couleurCritere(valeur: number | null | undefined): string {
        if (valeur === null || valeur === undefined) return 'text-muted-color';
        if (valeur >= 0.75) return 'text-green-600 dark:text-green-400';
        if (valeur >= 0.5) return 'text-orange-500';
        return 'text-red-500';
    }

    // Nom lisible d'une architecture (ex. densenet121 -> DenseNet-121)
    nomModele(nom: string): string {
        const noms: Record<string, string> = {
            simple_cnn: 'CNN fait maison',
            mobilenet_v3_small: 'MobileNet-V3 Small',
            mobilenet_v3_large: 'MobileNet-V3 Large',
            shufflenet_v2: 'ShuffleNet-V2',
            regnet_y_400mf: 'RegNet-Y 400MF',
            efficientnet_b0: 'EfficientNet-B0',
            resnet18: 'ResNet-18',
            resnet50: 'ResNet-50',
            densenet121: 'DenseNet-121'
        };
        return noms[nom] ?? nom;
    }

    private libererApercu(): void {
        const apercu = this.apercu();
        if (apercu) URL.revokeObjectURL(apercu);
        this.apercu.set(null);
    }

    private messageErreur(e: HttpErrorResponse): string {
        if (e.status === 0) return "L'API de Machine Learning ne répond pas. Lancez-la avec : python -m uvicorn main:app --port 8001";
        return e.error?.detail ?? `Erreur ${e.status}`;
    }
}
