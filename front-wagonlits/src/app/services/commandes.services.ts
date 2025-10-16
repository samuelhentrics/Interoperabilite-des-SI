import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Commande {
  id: number;
  number: string;
  type: string;
  dateDemande: string;
}

@Injectable({
  providedIn: 'root'
})
export class CommandesService {
  private apiUrl = 'http://localhost:3001/api/demandes'; // URL de ton back

  constructor(private http: HttpClient) {}

  getCommandes(): Observable<Commande[]> {
    return this.http.get<Commande[]>(this.apiUrl);
  }
}
