import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-demandes-add',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule, RouterModule],
  templateUrl: './demandes-add.component.html',
  styleUrls: ['./demandes-add.component.scss']
})
export class DemandesAddComponent {
  panne_id = '';
  type_panne = '';
  comment_panne = '';
  submitting = false;

  // Liste des types de pannes possibles
  typesPannes = [
    'Electrique',
    'Mécanique',
    'Hydraulique',
    'Pneumatique',
    'Electronique',
    'Informatique',
    'Carrosserie',
    'Moteur',
    'Transmission',
    'Freinage',
    'Climatisation',
    'Autre'
  ];

  constructor(private http: HttpClient, private router: Router) {}

  async submit() {
    if (!this.type_panne) return alert('Le type de panne est requis');
    this.submitting = true;
    try {
      const resp: any = await this.http.post(`${environment.apiUrl}/demandes`, {
        fault_id: this.panne_id || undefined,
        fault_type: this.type_panne,
        comment: this.comment_panne || undefined
      },
      {
        responseType: 'text'
      }
    ).toPromise();
      console.log('Created demande', resp);
      this.router.navigate(['/demandes']);
    } catch (err) {
      console.error('Erreur création demande', err);
      alert('Erreur lors de la création de la demande');
    } finally {
      this.submitting = false;
    }
  }
}
