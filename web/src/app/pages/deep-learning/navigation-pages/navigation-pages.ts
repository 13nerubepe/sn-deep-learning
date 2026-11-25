import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';

// Une page d'un module (ex. « Prédiction », « Performance »)
export interface PageModule {
    id: string;                                                   // morceau d'adresse : /classification-images/<id>
    label: string;                                                // texte du bouton
    icon: string;                                                 // icône PrimeIcons
}

// Boutons de navigation entre les pages d'un module :
//  - position « haut » : une barre avec un bouton par page ;
//  - position « bas »  : les boutons « Précédent » et « Suivant ».
@Component({
    selector: 'app-navigation-pages',
    standalone: true,
    imports: [RouterLink, ButtonDirective],
    template: `
        @if (position() === 'haut') {
            <nav class="card !mb-0 !p-2 flex gap-1 overflow-x-auto" aria-label="Pages du module">
                @for (p of pages(); track p.id; let n = $index) {
                    <a [routerLink]="['/', base(), p.id]"
                       class="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                       [class.bg-primary]="p.id === active()"
                       [class.text-primary-contrast]="p.id === active()"
                       [class.text-muted-color]="p.id !== active()"
                       [class.hover:bg-surface-100]="p.id !== active()"
                       [attr.aria-current]="p.id === active() ? 'page' : null">
                        <span class="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
                              [class.bg-white/25]="p.id === active()"
                              [class.bg-surface-200]="p.id !== active()"
                              [class.dark:bg-surface-700]="p.id !== active()">{{ n + 1 }}</span>
                        <i [class]="p.icon"></i>
                        {{ p.label }}
                    </a>
                }
            </nav>
        } @else {
            <div class="flex items-center justify-between gap-3">
                @if (precedente(); as p) {
                    <a pButton [routerLink]="['/', base(), p.id]" icon="pi pi-arrow-left" [label]="'Précédent : ' + p.label" severity="secondary" [outlined]="true"></a>
                } @else {
                    <span></span>
                }
                <span class="hidden text-sm text-muted-color sm:inline">Page {{ rang() + 1 }} / {{ pages().length }}</span>
                @if (suivante(); as p) {
                    <a pButton [routerLink]="['/', base(), p.id]" icon="pi pi-arrow-right" iconPos="right" [label]="'Suivant : ' + p.label"></a>
                } @else {
                    <span></span>
                }
            </div>
        }
    `
})
export class NavigationPages {
    pages = input.required<PageModule[]>();                       // toutes les pages du module
    active = input.required<string>();                            // page affichée
    base = input.required<string>();                              // adresse du module (ex. classification-images)
    position = input<'haut' | 'bas'>('haut');

    rang = computed(() => Math.max(0, this.pages().findIndex((p) => p.id === this.active())));
    precedente = computed(() => this.pages()[this.rang() - 1] ?? null);
    suivante = computed(() => this.pages()[this.rang() + 1] ?? null);
}
