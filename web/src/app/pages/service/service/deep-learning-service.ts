import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { EntreeHistorique, ExempleImage, GraphiqueNotebook, InfoClassification, PrevisionAction, ResultatClassification } from '@/app/models/deep-learning-model';
import { environment } from '@/environments/environment';

// Appels à l'API de Machine Learning (FastAPI, dossier ml-api/), séparée du backend Django.
@Injectable({
    providedIn: 'root'
})
export class DeepLearningService {
    private http = inject(HttpClient);

    // Adresse de base de l'API ML, sans slash à la fin
    private mlApiUrl = environment.mlApiUrl.replace(/\/+$/, '');

    // Historique des prédictions de la visite (gardé en mémoire tant que l'onglet est ouvert)
    readonly historique = signal<EntreeHistorique[]>([]);

    // Adresse complète d'un fichier servi par l'API (image d'exemple, graphique)
    urlFichier(chemin: string): string {
        return `${this.mlApiUrl}${chemin}`;
    }

    // ---------- Module 1 : classification d'images ----------

    // Informations sur le modèle retenu (architecture, classes, scores)
    getInfoClassification(): Observable<InfoClassification> {
        return this.http.get<InfoClassification>(`${this.mlApiUrl}/classification/info`);
    }

    // Envoie une image et récupère la maladie prédite avec ses probabilités
    predireImage(fichier: File): Observable<ResultatClassification> {
        const donnees = new FormData();
        donnees.append('fichier', fichier, fichier.name);
        return this.http.post<ResultatClassification>(`${this.mlApiUrl}/classification/predire`, donnees);
    }

    // Images de test exportées par le notebook
    getExemples(): Observable<ExempleImage[]> {
        return this.http.get<ExempleImage[]>(`${this.mlApiUrl}/classification/exemples`);
    }

    // Graphiques exportés par le notebook (comparaison, courbes, matrice de confusion)
    getGraphiques(): Observable<GraphiqueNotebook[]> {
        return this.http.get<GraphiqueNotebook[]>(`${this.mlApiUrl}/classification/graphiques`);
    }

    // Télécharge une image d'exemple pour l'envoyer ensuite à la prédiction
    telechargerImage(chemin: string): Observable<Blob> {
        return this.http.get(this.urlFichier(chemin), { responseType: 'blob' });
    }

    // ---------- Module 2 : prévision du cours de Merck ----------

    // Historique de la dernière année et prévision des 20 prochains jours ouvrés
    getPrevisionMerck(): Observable<PrevisionAction> {
        return this.http.get<PrevisionAction>(`${this.mlApiUrl}/prevision/merck`);
    }
}
