import { Component } from '@angular/core';

@Component({
    standalone: true,
    selector: 'app-footer',
    template: `<div class="layout-footer">
        <span class="font-bold text-primary">DermaPharm AI</span>
        <span class="text-muted-color">· Intelligence artificielle pour la dermatologie et la pharma · © {{ annee }}</span>
    </div>`
})
export class AppFooter {
    readonly annee = new Date().getFullYear();
}
