import { Component, OnInit, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';

import { InfoClassification } from '@/app/models/deep-learning-model';
import { DeepLearningService } from '@/app/pages/service/service/deep-learning-service';
import { AppConstantRoute } from '@/app/constants';

// Page d'accueil : présentation du projet Deep Learning (sujet, modules, démarche, technologies)
@Component({
    selector: 'app-a-propos',
    standalone: true,
    imports: [PercentPipe, RouterLink, ButtonDirective],
    templateUrl: './a-propos.html'
})
export class AProposComponent implements OnInit {
    private service = inject(DeepLearningService);

    info = signal<InfoClassification | null>(null);           // modèle retenu (si l'API ML répond)
    readonly routes = AppConstantRoute;
    readonly depot = 'https://github.com/13nerubepe/sn-deep-learning';   // code source et notebooks

    // Étapes du module 1 (notebook 1)
    readonly etapesClassification = [
        { titre: 'Analyse des données', texte: '5 dernières classes du 20 Skin Diseases Dataset : formats, tailles, couleurs, déséquilibre.' },
        { titre: 'Nettoyage', texte: 'Doublons détectés par empreinte MD5 et supprimés, y compris entre train et test (fuite de données).' },
        { titre: 'Préparation', texte: 'Découpage stratifié train / validation, augmentation de données et suréchantillonnage des classes rares.' },
        { titre: 'Comparaison de 9 CNN', texte: 'Un CNN fait maison et 8 CNN pré-entraînés sur ImageNet (transfer learning en 2 phases, arrêt anticipé).' },
        { titre: 'Choix du modèle', texte: 'Score global = moyenne de 7 critères (accuracy, sensibilité, spécificité, pire classe, F1, MCC, AUROC).' },
        { titre: 'Évaluation et explication', texte: 'Test final sur des images jamais vues, intervalles de confiance, et Grad-CAM pour voir où le CNN regarde.' }
    ];

    // Étapes du module 2 (notebook 2)
    readonly etapesPrevision = [
        { titre: 'Données', texte: 'Cours de clôture de Merck (MRK) depuis 2015, récupérés sur Yahoo Finance.' },
        { titre: 'Modèle', texte: 'NeuralProphet : 60 jours observés pour prévoir les 20 jours ouvrés suivants, avec saisonnalité annuelle.' },
        { titre: 'Contrôle', texte: 'Backtest sur les 20 derniers jours connus (MAE, RMSE, MAPE), comparé à une référence naïve.' }
    ];

    readonly technologies = ['Python', 'PyTorch', 'torchvision', 'scikit-learn', 'NeuralProphet', 'yfinance', 'FastAPI', 'Angular', 'PrimeNG', 'Tailwind CSS'];

    ngOnInit(): void {
        this.service.getInfoClassification().subscribe({ next: (info) => this.info.set(info), error: () => this.info.set(null) });
    }

    nomModele(nom: string): string {
        const noms: Record<string, string> = {
            simple_cnn: 'CNN fait maison', mobilenet_v3_small: 'MobileNet-V3 Small', mobilenet_v3_large: 'MobileNet-V3 Large',
            shufflenet_v2: 'ShuffleNet-V2', regnet_y_400mf: 'RegNet-Y 400MF', efficientnet_b0: 'EfficientNet-B0',
            resnet18: 'ResNet-18', resnet50: 'ResNet-50', densenet121: 'DenseNet-121'
        };
        return noms[nom] ?? nom;
    }
}
