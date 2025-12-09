import { Component } from '@angular/core';
import { Router } from '@angular/router';
import localeFr from '@angular/common/locales/fr';
import { CommonModule, registerLocaleData } from '@angular/common';

// Enregistrement de la locale française
registerLocaleData(localeFr, 'fr');

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  userName: string = 'A. Boggia';
  currentDate: Date = new Date();

  constructor(private router: Router) { }

  ngOnInit(): void {
    // Ici, on pourrait appeler des services pour récupérer
    // les vraies valeurs des KPIs (devis, réparations en cours, etc.)
  }

  /**
   * Gère la navigation vers les différentes sections de l'ERP.
   * @param path Le chemin de la route de destination
   */
  navigateTo(path: string): void {
    console.log(`Navigation vers la section : /${path}`);
    this.router.navigate([`/${path}`]);
  }
}
