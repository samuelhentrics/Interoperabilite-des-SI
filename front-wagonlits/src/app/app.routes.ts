import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AboutComponent } from './pages/about/about.component';
import { DemandesListingComponent } from './pages/demandes-listing/demandes-listing.component';
import { DemandesEditComponent } from './pages/demandes-edit/demandes-edit.component';
import { DemandesAddComponent } from './pages/demandes-add/demandes-add.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'about', component: AboutComponent },
  { path: 'demandes', component: DemandesListingComponent },
  { path: 'demandes/add', component: DemandesAddComponent },
  { path: 'demandes/:id', component: DemandesEditComponent },
];