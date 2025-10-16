import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  userName: string = 'S. Hentrics';
  currentDate: Date = new Date();

  constructor(private router: Router) { }

  ngOnInit(): void {
  }

  /**
   * Navigue vers une route spécifique de l'application.
   * @param path Le chemin de la route (ex: 'orders', 'planning')
   */
  navigateTo(path: string): void {
    console.log(`Navigation vers : /${path}`);
    this.router.navigate([`/${path}`]);
  }
}
