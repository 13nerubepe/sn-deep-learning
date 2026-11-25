import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonDirective } from 'primeng/button';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';

import { InfoClassification, ResultatClassification } from '@/app/models/deep-learning-model';
import { DeepLearningService } from '@/app/pages/service/service/deep-learning-service';

// Module 1 du projet Deep Learning : prédire la maladie de peau présente sur une image.
@Component({
    selector: 'app-classification',
    standalone: true,
    imports: [DecimalPipe, PercentPipe, ButtonDirective, Message, ProgressBar, Skeleton, Tag],
    templateUrl: './classification.html'
})
export class ClassificationComponent implements OnInit, OnDestroy {
    private service = inject(DeepLearningService);

    info = signal<InfoClassification | null>(null);           // modèle utilisé
    erreurInfo = signal<string | null>(null);

    fichier = signal<File | null>(null);                       // image choisie
    apercu = signal<string | null>(null);                      // adresse locale de l'image, pour l'afficher
    glisser = signal(false);                                   // une image est glissée au-dessus de la zone

    chargement = signal(false);                                // prédiction en cours
    resultat = signal<ResultatClassification | null>(null);
    erreur = signal<string | null>(null);

    ngOnInit(): void {
        this.service.getInfoClassification().subscribe({
            next: (info) => this.info.set(info),
            error: (e: HttpErrorResponse) => this.erreurInfo.set(this.messageErreur(e))
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
                this.chargement.set(false);
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
