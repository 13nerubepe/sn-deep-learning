// Modèles de données de l'API de Machine Learning (dossier ml-api/)

// ---------- Module 1 : classification d'images ----------

export interface InfoClassification {
    architecture: string;
    classes: string[];
    noms_courts: string[];
    taille_image: number;
    f1_validation: number | null;
    accuracy_test: number | null;
    f1_test: number | null;
}

export interface ProbabiliteClasse {
    classe: string;
    nom_court: string;
    probabilite: number;
}

export interface ResultatClassification {
    prediction: ProbabiliteClasse;
    probabilites: ProbabiliteClasse[];
    architecture: string;
}

// ---------- Module 2 : prévision du cours de Merck ----------

export interface PointPrix {
    date: string;
    prix: number;
}

export interface PointPrevision extends PointPrix {
    jour: number;
}

export interface PrevisionAction {
    action: string;
    source: string;
    horizon: number;
    dernier_cours: number;
    derniere_date: string;
    historique: PointPrix[];
    previsions: PointPrevision[];
}
