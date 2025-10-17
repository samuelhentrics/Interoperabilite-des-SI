import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Demande {
  id: string; // UUID or string id
  number: string;
  type: string;
  dateDemande: string;
  client_name: string;
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
