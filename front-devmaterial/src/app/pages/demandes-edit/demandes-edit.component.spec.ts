import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemandesEditComponent } from './demandes-edit.component';

describe('DemandesListingComponent', () => {
  let component: DemandesEditComponent;
  let fixture: ComponentFixture<DemandesEditComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemandesEditComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemandesEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
