import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Demande {
  id: string; // UUID
  code: string;
  statut?: string | null;
  datecreation?: string; // ISO date string
  type?: string;
  commentaire?: string | null;
  client_id?: string;
  client_name?: string;
  devis?: Array<{
    id?: string;
    prixdepiece?: string;
    prixhoraire?: string;
    tempsestime?: any;
    demande_id?: string;
  }>;
  interventions?: Array<any>;
  inspection?: any;
  rapport?: any;
}

@Injectable({
  providedIn: 'root'
})
export class DemandesService {
  private apiUrl = 'http://localhost:3000/api/demandes'; // URL de ton back

  constructor(private http: HttpClient) {}

  getDemandes(): Observable<Demande[]> {
    return this.http.get<Demande[]>(this.apiUrl);
  }
}
