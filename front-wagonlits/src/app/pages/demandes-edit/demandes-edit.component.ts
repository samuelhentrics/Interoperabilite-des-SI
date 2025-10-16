import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

type TabKey = 'info' | 'inspection' | 'devis' | 'intervention' | 'rapport';

@Component({
  selector: 'app-demandes-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, HttpClientModule],
  templateUrl: './demandes-edit.component.html',
  styleUrls: ['./demandes-edit.component.scss']
})
export class DemandesEditComponent implements OnInit {

  // Onglet actif
  activeTab = signal<TabKey>('info');

  // Forms
  infoForm!: FormGroup;
  inspectionForm!: FormGroup;
  devisForm!: FormGroup;
  interventionForm!: FormGroup;
  rapportForm!: FormGroup;

  // Calcul total (prix pièce + prix horaire) – simple et modifiable
  prixTotal = signal<number>(0);

  isDeleting = signal(false);

constructor(private fb: FormBuilder,
            private http: HttpClient,
            private route: ActivatedRoute,
            private router: Router) {}

  demandeId!: number;

ngOnInit(): void {
  this.buildForms();

  // onglet depuis l'URL (sinon 'info')
  const fromUrl = this.route.snapshot.queryParamMap.get('tab') as TabKey | null;
  this.activeTab.set(fromUrl ?? 'info');

  effect(() => {
    const piece = Number(this.devisForm?.get('prixPiece')?.value || 0);
    const horaire = Number(this.devisForm?.get('prixHoraire')?.value || 0);
    const total = piece + horaire;
    this.prixTotal.set(total);
    this.devisForm?.get('prixTotal')?.setValue(total, { emitEvent: false });
  });
}

  buildForms() {
    this.infoForm = this.fb.group({
      numero: [''],
      type: [''],
      commentaire: ['']
    });

    this.inspectionForm = this.fb.group({
      numero: [''],
      dateInspection: [''],
      piecesAChanger: [''],
      commentaire: ['']
    });

    this.devisForm = this.fb.group({
      numero: [''],
      prixPiece: [0, [Validators.min(0)]],
      prixHoraire: [0, [Validators.min(0)]],
      prixTotal: [{ value: 0, disabled: true }]
    });

    this.interventionForm = this.fb.group({
      numero: [''],
      dateIntervention: [''],
      tempsTheorique: [''],
      tempsReel: [''],
      commentaire: ['']
    });

    this.rapportForm = this.fb.group({
      numero: [''],
      finIntervention: [false],
      commentaireFinal: ['']
    });
  }

setTab(tab: TabKey) {
  this.activeTab.set(tab);
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
}
