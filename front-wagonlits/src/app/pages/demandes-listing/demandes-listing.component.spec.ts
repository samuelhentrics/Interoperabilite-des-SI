import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemandesListingComponent } from './demandes-listing.component';

describe('DemandesListingComponent', () => {
  let component: DemandesListingComponent;
  let fixture: ComponentFixture<DemandesListingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemandesListingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemandesListingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
