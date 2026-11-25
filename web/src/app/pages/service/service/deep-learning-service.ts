import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { InfoClassification, PrevisionAction, ResultatClassification } from '@/app/models/deep-learning-model';
import { environment } from '@/environments/environment';

// Appels à l'API de Machine Learning (FastAPI, dossier ml-api/), séparée du backend Django.
@Injectable({
    providedIn: 'root'
})
export class DeepLearningService {
    private http = inject(HttpClient);

    // Adresse de base de l'API ML, sans slash à la fin
    private mlApiUrl = environment.mlApiUrl.replace(/\/+$/, '');

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

    // ---------- Module 2 : prévision du cours de Merck ----------

    // Historique de la dernière année et prévision des 20 prochains jours ouvrés
    getPrevisionMerck(): Observable<PrevisionAction> {
        return this.http.get<PrevisionAction>(`${this.mlApiUrl}/prevision/merck`);
    }
}
