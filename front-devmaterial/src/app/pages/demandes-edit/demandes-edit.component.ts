import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

type TabKey = 'info' | 'inspection' | 'devis' | 'intervention' | 'rapport';

@Component({
  selector: 'app-demandes-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule],
  templateUrl: './demandes-edit.component.html',
  styleUrls: ['./demandes-edit.component.scss']
})
export class DemandesEditComponent implements OnInit {

  // Onglet actif
  activeTab: string = 'info';

  numDemande = '';

  // Données de la demande (utiliser le JSON directement)
  demande: any = {
    id: '',
    code: '',
    statut: null,
    datecreation: null,
    type: '',
    commentaire: null,
    client_id: null,
    client_name: null,
    devis: [],
    interventions: [],
    inspection: null,
    rapport: null
  };

  // Calcul total (prix pièce + prix horaire) – simple et modifiable

  // Reactive effect to recompute prixTotal when demande prices change.
  // Placed as a field initializer so it's created in an injection context.
  private prixEffect = effect(() => {
    // compute total from devis array if available
    const devis = Array.isArray(this.demande.devis) ? this.demande.devis : [];
    let total = 0;
    for (const d of devis) {
      const p = Number(d.prixdepiece || 0);
      const h = Number(d.prixhoraire || 0);
      total += p + h;
    }
    this.prixTotal.set(total);
  });
  prixTotal = signal<number>(0);

  isDeleting = signal(false);

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router) { }

  demandeId!: string;

  ngOnInit(): void {
    // Récupérer l'ID de la demande depuis l'URL
  this.demandeId = this.route.snapshot.paramMap.get('id') || '';
    this.numDemande = this.genNumDemande();
    this.getDemande();

    // Onglet depuis l'URL
    const rawTab = this.route.snapshot.queryParamMap.get('tab');
    const validTabs: TabKey[] = ['info', 'inspection', 'devis', 'intervention', 'rapport'];
    if (rawTab && validTabs.includes(rawTab as TabKey)) {
      this.activeTab = rawTab as TabKey;
    } else {
      this.activeTab = 'info';
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: 'info' },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  getDemande() {
    this.http.get(`http://localhost:3000/api/demandes/${this.demandeId}`).subscribe({
      next: (data: any) => {
        console.log('Demande data:', data);
        // normalize the backend shape if necessary
        this.demande = {
          id: data.id,
          code: data.code || data.numero || '',
          statut: data.statut ?? null,
          datecreation: data.datecreation || data.dateDemande || null,
          type: data.type || '',
          commentaire: data.commentaire ?? null,
          client_id: data.client_id || null,
          client_name: data.client_name || (data.client ? data.client.nom : null),
          devis: data.devis || [],
          interventions: data.interventions || [],
          inspection: data.inspection || null,
          rapport: data.rapport || null
        };
      },
      error: (err) => {
        console.error(err);
        alert('Erreur lors du chargement de la demande');
      }
    });
  }


  saveChange() {
    // Send the normalized JSON back to the backend with PUT
    const payload = { ...this.demande };
    this.http.put(`http://localhost:3000/api/demandes/${this.demandeId}`, payload).subscribe({
      next: (res) => {
        console.log('Save successful', res);
        alert('Enregistré');
      },
      error: (err) => {
        console.error('Save error', err);
        alert('Erreur lors de l\'enregistrement');
      }
    });
  }

  setTab(tab: TabKey) {
    this.activeTab = tab;
    // met à jour l'URL ?tab=...
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge'
    });
  }

  deleteDemande() {
    this.isDeleting.set(true);
    this.http.delete(`/api/demandes/${this.demandeId}`).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.router.navigate(['/demandes']);
      },
      error: (err) => {
        this.isDeleting.set(false);
        console.error(err);
        alert('Erreur lors de la suppression');
      }
    });
  }

  fermerDemande() {
    this.router.navigate(['/demandes']);
  }

  genNumDemande(): string {
    // generer un truc à 6 chiffres avec des 0 devant
    const random = Math.floor(Math.random() * 1000000);
    return random.toString().padStart(6, '0');
  }
}
