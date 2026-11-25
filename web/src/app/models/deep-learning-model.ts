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
    // Champs ajoutés par la section 12 du notebook 1 (absents avec un ancien classes.json)
    critere_choix?: string | null;
    score_validation?: number | null;
    score_test?: number | null;
    metriques_test?: Record<string, number | null>;              // les 7 critères (Accuracy, Sensibilité macro…)
    ic_test?: { accuracy_equilibree?: (number | null)[]; auroc?: (number | null)[] };
    rappel_par_classe_test?: Record<string, number | null>;      // sensibilité de chaque maladie
    nb_images_test?: number | null;
    comparaison?: LigneComparaison[];                             // les 9 CNN comparés
}

// Une ligne du tableau de comparaison des CNN (section 10-b du notebook)
export interface LigneComparaison {
    modele: string;
    score: number | null;
    accuracy: number | null;
    sensibilite: number | null;
    specificite: number | null;
    sensib_pire: number | null;
    f1: number | null;
    mcc: number | null;
    auroc: number | null;
    ecart: number | null;
    epoques: number | null;
    params_m: number | null;
    duree_min: number | null;
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
