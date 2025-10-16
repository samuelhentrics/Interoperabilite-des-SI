import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DemandesAddComponent } from './demandes-add.component';

describe('DemandesAddComponent', () => {
  let component: DemandesAddComponent;
  let fixture: ComponentFixture<DemandesAddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemandesAddComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DemandesAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
