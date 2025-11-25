import { Component, OnInit, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';

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

  demandeId!: number;

  ngOnInit(): void {
    // Récupérer l'ID de la demande depuis l'URL
    this.demandeId = Number(this.route.snapshot.paramMap.get('id'));
    this.numDemande = this.genNumDemande();

    // Onglet depuis l'URL
    // charger la demande depuis l'API (XML)
    this.loadDemande();
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


  saveChange() {
    // Convert current `demande` object to XML and PUT to backend
    const xml = this.buildDemandeXml(this.demande);
    this.http.put(`${environment.apiUrl}/demandes/${this.demandeId}`, xml, {
      headers: { 'Content-Type': 'application/xml' },
      responseType: 'text'
    }).subscribe({
      next: (res) => {
        console.log('saved', res);
        alert('Enregistré');
      },
      error: (err) => {
        console.error('save error', err);
        alert('Erreur lors de l\'enregistrement');
      }
    });
  }

  private loadDemande() {
    this.http.get(`${environment.apiUrl}/demandes/${this.demandeId}`, { responseType: 'text' }).subscribe({
      next: (xmlText) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(xmlText, 'application/xml');
          // naive parsing: map known nodes to fields
          const getText = (tag: string) => {
            const el = doc.getElementsByTagName(tag)[0];
            return el ? el.textContent || '' : '';
          };

          this.demande.numero = getText('numero') || this.demande.numero;
          this.demande.type = getText('type') || this.demande.type;
          this.demande.commentaire = getText('commentaire') || this.demande.commentaire;
          this.demande.client_name = getText('client_name') || this.demande.client_name;
          // dates
          const di = getText('dateInspection');
          if (di) this.demande.dateInspection = di;
          const dint = getText('dateIntervention');
          if (dint) this.demande.dateIntervention = dint;
          // numeric
          const pp = getText('prixPiece');
          if (pp) this.demande.prixPiece = Number(pp);
          const ph = getText('prixHoraire');
          if (ph) this.demande.prixHoraire = Number(ph);
          const pieces = getText('piecesAChanger');
          if (pieces) this.demande.piecesAChanger = pieces;

          // set displayed numero
          this.numDemande = this.demande.numero || this.numDemande;
        } catch (e) {
          console.error('XML parse error', e);
        }
      },
      error: (err) => {
        console.error('Failed loading demande XML', err);
      }
    });
  }

  private buildDemandeXml(d: any): string {
    // Build a simple XML representation matching backend expectations
    // Note: keep it simple and escape minimal chars
    const esc = (v: any) => {
      if (v == null) return '';
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    return `<?xml version="1.0" encoding="UTF-8"?>\n<demande>\n  <numero>${esc(d.numero)}</numero>\n  <type>${esc(d.type)}</type>\n  <client_name>${esc(d.client_name)}</client_name>\n  <commentaire>${esc(d.commentaire)}</commentaire>\n  <piecesAChanger>${esc(d.piecesAChanger)}</piecesAChanger>\n  <prixPiece>${esc(d.prixPiece)}</prixPiece>\n  <prixHoraire>${esc(d.prixHoraire)}</prixHoraire>\n  <dateInspection>${esc(d.dateInspection)}</dateInspection>\n  <dateIntervention>${esc(d.dateIntervention)}</dateIntervention>\n</demande>`;
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
    this.http.delete(`${environment.apiUrl}/demandes/${this.demandeId}`).subscribe({
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
