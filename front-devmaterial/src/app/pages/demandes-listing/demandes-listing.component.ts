import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Demande, DemandesService } from '../../services/demandes.services';

@Component({
  selector: 'app-demandes-listing',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './demandes-listing.component.html',
  styleUrls: ['./demandes-listing.component.scss']
})
export class DemandesListingComponent implements OnInit {

  demandes: Demande[] = [];

  constructor(private demandesService: DemandesService) {}

  ngOnInit(): void {
    this.demandesService.getDemandes().subscribe({
      next: (data) => this.demandes = data,
      error: (err) => console.error('Erreur lors du chargement des demandes :', err)
    });
  }
}
