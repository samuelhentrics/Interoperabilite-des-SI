import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { AboutComponent } from './pages/about/about.component';
import { DemandesListingComponent } from './pages/demandes-listing/demandes-listing.component';
import { DemandesAddComponent } from './pages/demandes-add/demandes-add.component';
import { DemandesEditComponent } from './pages/demandes-edit/demandes-edit.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'about', component: AboutComponent },
  { path: 'demandes', component: DemandesListingComponent },
  // ensure the 'add' route is before ':id' so 'add' is not treated as an id
  { path: 'demandes/add', component: DemandesAddComponent },
  { path: 'demandes/:id', component: DemandesEditComponent }
];