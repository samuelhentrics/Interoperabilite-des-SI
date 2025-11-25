import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Demande {
  id: string; // UUID
  fault_id?: string | null;
  fault_type: string;
  comment?: string | null;
  request_date?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class DemandesService {
  private apiUrl = `${environment.apiUrl}/demandes`;

  constructor(private http: HttpClient) {}

  getDemandes(): Observable<Demande[]> {
    return this.http.get<Demande[]>(this.apiUrl);
  }
}
