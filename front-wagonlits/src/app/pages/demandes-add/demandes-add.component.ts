import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Commande, CommandesService } from '../../services/commandes.services';

@Component({
  selector: 'app-demandes-add',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './demandes-add.component.html',
  styleUrls: ['./demandes-add.component.scss']
})
export class DemandesAddComponent implements OnInit {

  commandes: Commande[] = [];

  constructor(private commandesService: CommandesService) {}

  ngOnInit(): void {
    this.commandesService.getCommandes().subscribe({
      next: (data) => this.commandes = data,
      error: (err) => console.error('Erreur lors du chargement des commandes :', err)
    });
  }
}
