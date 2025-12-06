import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Demande {
  id: string; // UUID
  fault_id?: string | null;      // = code en base
  fault_type: string;            // = type en base
  comment?: string | null;       // = comment en base
  request_date?: string | null;  // = createdat en base
}

@Injectable({
  providedIn: 'root'
})
export class DemandesService {
  private apiUrl = `${environment.apiUrl}/demandes`;

  constructor(private http: HttpClient) {}

  getDemandes(): Observable<Demande[]> {
    return this.http
      .get(this.apiUrl, {
        responseType: 'text',      //  on récupère du XML brut
      })
      .pipe(
        map(xml => this.parseDemandesXml(xml))
      );
  }

  /** Parse le XML renvoyé par /api/demandes en tableau de Demande */
  private parseDemandesXml(xml: string): Demande[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // structure : <demandes><pagination>...</pagination><items><demande>...</demande>...</items></demandes>
    const demandeNodes = Array.from(doc.querySelectorAll('items > demande'));

    return demandeNodes.map(node => ({
      id: node.querySelector('id')?.textContent ?? '',
      fault_id: node.querySelector('code')?.textContent || null,
      fault_type: node.querySelector('type')?.textContent || '',
      comment: node.querySelector('comment')?.textContent || null,
      request_date: node.querySelector('createdat')?.textContent || null,
    }));
  }
}
