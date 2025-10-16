import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { Demande, DemandesService } from '../../services/demandes.services';

@Component({
  selector: 'app-demandes-listing',
  standalone: true,
  imports: [CommonModule, HttpClientModule, RouterModule],
  templateUrl: './demandes-listing.component.html',
  styleUrls: ['./demandes-listing.component.scss']
})
export class DemandesListingComponent implements OnInit {

  demandes: Demande[] = [];
  isTriggering = false;
  triggerResult: any = null;
  constructor(private http: HttpClient, private demandesService: DemandesService) {}

  ngOnInit(): void {
    this.demandesService.getDemandes().subscribe({
      next: (data) => this.demandes = data,
      error: (err) => console.error('Erreur lors du chargement des demandes :', err)
    });

    
  }

  triggerWebhook(): void {
    this.isTriggering = true;
    this.triggerResult = null;

    console.log('Triggering webhook...');
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
