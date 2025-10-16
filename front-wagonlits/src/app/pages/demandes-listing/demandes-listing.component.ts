import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Commande, CommandesService } from '../../services/commandes.services';

@Component({
  selector: 'app-demandes-listing',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './demandes-listing.component.html',
  styleUrls: ['./demandes-listing.component.scss']
})
export class DemandesListingComponent implements OnInit {

  commandes: Commande[] = [];
  isTriggering = false;
  triggerResult: any = null;

  constructor(
    private commandesService: CommandesService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.commandesService.getCommandes().subscribe({
      next: (data) => this.commandes = data,
      error: (err) => console.error('Erreur lors du chargement des commandes :', err)
    });
  }

  triggerWebhook(): void {
    this.isTriggering = true;
    this.triggerResult = null;

    const url = 'http://localhost:3008/trigger-event';
    const payload = {
      from: 'erp-wagonlits',
      event: 'add-demande',
      body: { test: 'test' },
      who: ['erp-devmaterial']
    };

    this.http.post(url, payload).subscribe({
      next: (res) => this.triggerResult = res,
      error: (err) => {
        console.error('Erreur webhook:', err);
        this.triggerResult = err?.error ?? { error: true, message: err?.message || 'Erreur inconnue' };
      },
      complete: () => this.isTriggering = false
    });
  }
}
