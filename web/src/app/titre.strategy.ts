import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const NOM_APPLICATION = 'DermaPharm AI';
const TITRE_PAR_DEFAUT = `${NOM_APPLICATION} – IA pour la dermatologie et la pharma`;

@Injectable({ providedIn: 'root' })
export class TitreStrategy extends TitleStrategy {
    private readonly title = inject(Title);

    override updateTitle(etat: RouterStateSnapshot): void {
        const titre = this.buildTitle(etat);
        this.title.setTitle(titre ? `${titre} · ${NOM_APPLICATION}` : TITRE_PAR_DEFAUT);
    }
}
