import { Component, computed, inject } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StyleClassModule } from 'primeng/styleclass';
import { AppConfigurator } from './app.configurator';
import { LayoutService } from '@/app/pages/service/service/layout.service';
import { Menu } from 'primeng/menu';
import { AuthService } from '@/app/pages/service/service/auth.service';
import { Notifications } from '@/app/pages/commons/notifications/notifications';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [RouterModule, CommonModule, StyleClassModule, AppConfigurator, Notifications, Menu],
    template: ` <div class="layout-topbar">
        <div class="layout-topbar-logo-container">
            <button class="layout-menu-button layout-topbar-action" (click)="layoutService.onMenuToggle()">
                <i class="pi pi-bars"></i>
            </button>
            <a class="layout-topbar-logo" routerLink="/">
                <svg
                    viewBox="0 0 54 40"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-label="Logo DermaPharm AI"
                    role="img"
                >
                    <defs>
                        <linearGradient id="dp-orange" x1="4" y1="2" x2="50" y2="38" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stop-color="#FFB52E" />
                            <stop offset="50%" stop-color="#FF7900" />
                            <stop offset="100%" stop-color="#E94B00" />
                        </linearGradient>
                    </defs>

                    <!-- Goutte : la peau (module 1, dermatologie) -->
                    <path d="M18 2C18 2 5 16.5 5 25A13 13 0 0 0 31 25C31 16.5 18 2 18 2Z" fill="url(#dp-orange)" />

                    <!-- Croix : la pharmacie (Merck) -->
                    <path d="M15.5 17.5H20.5V22.5H25.5V27.5H20.5V32.5H15.5V27.5H10.5V22.5H15.5Z" fill="#ffffff" />

                    <!-- Courbe à nœuds : réseau de neurones et prévision du cours (module 2) -->
                    <path d="M31 33L38 25L44 28L50 13" stroke="url(#dp-orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="38" cy="25" r="2.6" fill="#FF9A00" />
                    <circle cx="44" cy="28" r="2.6" fill="#FF9A00" />
                    <circle cx="50" cy="13" r="3.2" fill="#E94B00" />
                </svg>
                <span>DermaPharm <span class="text-primary">AI</span></span>
            </a>
        </div>

        <div class="layout-topbar-actions">
            <div class="layout-config-menu">
                <app-notifications />
                <button type="button" class="layout-topbar-action" (click)="toggleDarkMode()">
                    <i [ngClass]="{ 'pi': true, 'pi-moon': layoutService.isDarkTheme(), 'pi-sun': !layoutService.isDarkTheme() }"></i>
                </button>
                <div class="relative">
                    <button
                        class="layout-topbar-action layout-topbar-action-highlight"
                        pStyleClass="@next"
                        enterFromClass="hidden"
                        enterActiveClass="animate-scalein"
                        leaveToClass="hidden"
                        leaveActiveClass="animate-fadeout"
                        [hideOnOutsideClick]="true"
                    >
                        <i class="pi pi-palette"></i>
                    </button>
                    <app-configurator />
                </div>
            </div>

            <button class="layout-topbar-menu-button layout-topbar-action" pStyleClass="@next" enterFromClass="hidden" enterActiveClass="animate-scalein" leaveToClass="hidden" leaveActiveClass="animate-fadeout" [hideOnOutsideClick]="true">
                <i class="pi pi-ellipsis-v"></i>
            </button>

            <div class="layout-topbar-menu hidden lg:block">
                <div class="layout-topbar-menu-content">
                    <!--                    <button type="button" class="layout-topbar-action">-->
                    <!--                        <i class="pi pi-inbox"></i>-->
                    <!--                        <span>Messages</span>-->
                    <!--                    </button>-->

                    <!--                    <button type="button" class="layout-topbar-action" aria-haspopup="true" (click)="userMenu.toggle($event)">-->
                    <!--                        <p-avatar [label]="initials()" shape="circle" styleClass="!bg-primary !text-primary-contrast" />-->
                    <!--                        <span>{{ displayName() }}</span>-->
                    <!--                        <i class="pi pi-angle-down"></i>-->
                    <!--                    </button>-->
                    <button
                        type="button"
                        class="flex cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent py-1 pl-1 pr-2 hover:bg-surface-100 dark:hover:bg-surface-800"
                        aria-haspopup="true"
                        (click)="userMenu.toggle($event)"
                    >
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-contrast">
                            {{ initials() }}
                        </span>
                        <span class="whitespace-nowrap text-sm font-medium text-surface-900 dark:text-surface-0">
                            {{ displayName() }}
                        </span>
                        <i class="pi pi-angle-down text-sm text-surface-500"></i>
                    </button>

                    <p-menu #userMenu [model]="userItems" [popup]="true" appendTo="body" />
                </div>
            </div>
        </div>
    </div>`
})
export class AppTopbar {
    private router = inject(Router);
    private readonly authService = inject(AuthService);

    displayName = computed(() => {
        const user = this.authService.user();
        const nomComplet = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();

        return nomComplet || user?.email?.split('@')[0] || 'Utilisateur';
    });
    initials = computed(() =>
        this.displayName()
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((partie) => partie[0].toUpperCase())
            .join('')
    );

    // displayName = computed(() =>
    //     this.authService.user()?.email?.split('@')[0] ?? 'Utilisateur');
    // initials = computed(() =>
    //     this.displayName().slice(0, 2).toUpperCase());

    // Fonction de déconnexion
    seDeconnecter(): void {
        this.authService.logout();
    }
    userItems: MenuItem[] = [
        { label: 'Mon profil', icon: 'pi pi-user', command: () => this.router.navigate(['/profil']) },
        // { label: 'Paramètres', icon: 'pi pi-cog', command: () => this.router.navigate(['/parametres']) },
        { label: 'Aide', icon: 'pi pi-question-circle', command: () => this.router.navigate(['/aide']) },
        // { label: 'Actualités', icon: 'pi pi-fw pi-home', routerLink: ['/actualités'] },
        { separator: true },
        // { label: 'Se déconnecter', icon: 'pi pi-sign-out', styleClass: 'text-red-500', command: () => this.authService.logout() }
        { label: 'Se déconnecter', icon: 'pi pi-sign-out', styleClass: 'text-red-500', command: () => this.seDeconnecter() }
    ];



    items!: MenuItem[];
    layoutService = inject(LayoutService);
    auth = inject(AuthService);

    toggleDarkMode() {
        this.layoutService.layoutConfig.update((state) => ({
            ...state,
            darkTheme: !state.darkTheme
        }));
    }
}
