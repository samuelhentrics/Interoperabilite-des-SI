import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { Commande, CommandesService } from '../../services/commandes.services';

@Component({
  selector: 'app-demandes-listing',
  standalone: true,
  imports: [CommonModule, HttpClientModule, RouterModule],
  templateUrl: './demandes-listing.component.html',
  styleUrls: ['./demandes-listing.component.scss']
})
export class DemandesListingComponent implements OnInit {

  commandes: Commande[] = [];

  constructor(private commandesService: CommandesService) {}

  ngOnInit(): void {
    this.commandesService.getCommandes().subscribe({
      next: (data) => this.commandes = data,
      error: (err) => console.error('Erreur lors du chargement des commandes :', err)
    });
  }
}
