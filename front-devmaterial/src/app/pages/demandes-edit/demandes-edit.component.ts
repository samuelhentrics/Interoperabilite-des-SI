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
    numero: '',
    type: '',
    commentaire: '',
    dateInspection: null,
    piecesAChanger: '',
    prixPiece: 0,
    prixHoraire: 0,
    prixTotal: 0,
    dateIntervention: null,
    tempsTheorique: '',
    tempsReel: '',
    finIntervention: false,
    commentaireFinal: ''
  };

  // Calcul total (prix pièce + prix horaire) – simple et modifiable

  // Reactive effect to recompute prixTotal when demande prices change.
  // Placed as a field initializer so it's created in an injection context.
  private prixEffect = effect(() => {
    const piece = Number(this.demande.prixPiece || 0);
    const horaire = Number(this.demande.prixHoraire || 0);
    const total = piece + horaire;
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
        this.demande = data;
      },
      error: (err) => {
        console.error(err);
        alert('Erreur lors du chargement de la demande');
      }
    });
  }


  saveChange() {
    // Placeholder for save logic — for now just log
    console.log('ok');
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
