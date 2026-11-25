import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Notfound } from './app/pages/notfound/notfound';
import { AppConstantRoute } from '@/app/constants';
import { authGuard } from '@/app/pages/service/service/auth.guard';

// DermaPharm AI – Projet Deep Learning (M2 DS) : uniquement les deux modules et le compte utilisateur
export const appRoutes: Routes = [
    {
        path: '',
        component: AppLayout,
        // canActivate: [authGuard],
        children: [
            // Page d'accueil : le module 1
            { path: '', pathMatch: 'full', redirectTo: AppConstantRoute.Classification_PATH },

            // Module 1 : classification d'images de maladies de peau (CNN)
            {
                path: AppConstantRoute.Classification_PATH,
                title: "Classification d'images",
                loadComponent: () => import('./app/pages/deep-learning/classification/classification').then((c) => c.ClassificationComponent),
                data: { breadcrumb: 'Classification' },
            },
            // Module 2 : prévision du cours de Merck sur 20 jours (NeuralProphet)
            {
                path: AppConstantRoute.Prevision_PATH,
                title: 'Prévision Merck',
                loadComponent: () => import('./app/pages/deep-learning/prevision/prevision').then((c) => c.PrevisionComponent),
                data: { breadcrumb: 'Prévision' },
            },
            // Compte utilisateur
            {
                path: AppConstantRoute.Profil_PATH,
                title: 'Profil',
                loadComponent: () => import('./app/pages/auth/profile').then((c) => c.Profile),
                data: { breadcrumb: 'Profil' },
            },
        ]
    },
    { path: 'notfound', component: Notfound, title: 'Page introuvable' },
    {
        path: AppConstantRoute.Register_PATH,
        title: 'Inscription',
        loadComponent: () => import('./app/pages/auth/register').then((c) => c.Register),
        data: { breadcrumb: 'Register' },
    },
    { path: 'auth', loadChildren: () => import('./app/pages/auth/auth.routes') },
    { path: '**', redirectTo: '/notfound' }
];
