import { Simulation } from './src/Simulation';

const container = document.getElementById('app');

if (container) {
  new Simulation(container);
} else {
  console.error("L'élément conteneur avec l'ID 'app' est introuvable.");
}
