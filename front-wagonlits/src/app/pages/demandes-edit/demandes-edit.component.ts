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

  demandeId!: string;

  ngOnInit(): void {
    // Récupérer l'ID de la demande depuis l'URL
    this.demandeId = this.route.snapshot.paramMap.get('id') || '';
    //this.numDemande = this.genNumDemande();

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

        const getText = (tag: string, parent: Element | Document = doc) => {
          const el = parent.getElementsByTagName(tag)[0];
          return el ? (el.textContent || '').trim() : '';
        };

        // racine <demande>
        const root = doc.getElementsByTagName('demande')[0] || doc;

        this.demande.id          = getText('id', root);
        this.demande.code        = getText('code', root);
        this.demande.statut      = getText('state', root);
        this.demande.dateCreation= getText('createdat', root);
        this.demande.type        = getText('type', root);
        this.demande.commentaire = getText('comment', root);

        this.numDemande = this.demande.code || this.demande.id || this.numDemande;

        // inspection
        const inspEl = root.getElementsByTagName('inspection')[0];
        if (inspEl) {
          this.demande.inspection = {
            id:            getText('id', inspEl),
            date:          getText('inspectedat', inspEl),
            piecedefectueuse: getText('defectivecomponent', inspEl),
            commentaire:   getText('comment', inspEl),
          };
        }

        // devis (on prend le premier item pour l'écran simple)
        const devisEl = root.getElementsByTagName('devis')[0];
        if (devisEl) {
          const item = devisEl.getElementsByTagName('item')[0];
          if (item) {
            this.demande.devis = [{
              id:          getText('id', item),
              prixdepiece: Number(getText('pricecomponent', item) || 0),
              prixhoraire: Number(getText('pricehour', item) || 0),
              tempsestime: Number(getText('estimatedtime', item) || 0),
            }];
          }
        }

        // interventions (pareil, on prend la première pour l'écran simple)
        const intersEl = root.getElementsByTagName('interventions')[0];
        if (intersEl) {
          const item = intersEl.getElementsByTagName('item')[0];
          if (item) {
            this.demande.interventions = [{
              id:          getText('id', item),
              date:        getText('interventiondate', item),
              lieu:        getText('localisation', item),
              tempsreel:   Number(getText('realtime', item) || 0),
              commentaire: getText('comment', item),
            }];
          }
        }

        // pour l’affichage
        this.numDemande = this.demande.code || this.demande.id || this.numDemande;

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
  const esc = (v: any) => v == null ? '' : String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<?xml version="1.0" encoding="UTF-8"?>
          <demande>
            <id>${esc(d.id)}</id>
            <code>${esc(d.code)}</code>
            <state>${esc(d.statut ?? 0)}</state>
            <type>${esc(d.type)}</type>
            <comment>${esc(d.commentaire)}</comment>
          </demande>`;
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
    this.http.delete(`${environment.apiUrl}/demandes/${this.demandeId}`, {responseType: 'text'}).subscribe({
      
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
