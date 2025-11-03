import * as THREE from 'three';
import { PHYSIQUE } from '../Config';

/**
 * Encapsule l'état physique d'un objet (position, vitesse, orientation).
 */
export class EtatPhysique {
    public position: THREE.Vector3;
    public velocite: THREE.Vector3;
    public orientation: THREE.Quaternion;
    public velociteAngulaire: THREE.Vector3;
    public masse: number;
    public inertie: THREE.Vector3;

    private positionInitiale: THREE.Vector3;

    constructor(positionInitiale: THREE.Vector3, masse = PHYSIQUE.MASSE_CERF_VOLANT, inertie = new THREE.Vector3(0.06, 0.06, 0.09)) {
        this.positionInitiale = positionInitiale.clone();
        this.masse = masse;
        // Moment d'inertie réaliste pour un kite de 0.15kg (150g) avec envergure ~1.65m
        // I = (1/12) * m * L² pour une tige
        // Ix, Iy ~ 0.06 kg⋅m² pour rotation autour des axes transverses
        // Iz ~ 0.09 kg⋅m² pour rotation autour de l'axe longitudinal
        this.inertie = inertie;

        this.position = positionInitiale.clone();
        this.velocite = new THREE.Vector3();
        // Orientation identité au départ, sera configurée par la simulation
        this.orientation = new THREE.Quaternion();
        this.velociteAngulaire = new THREE.Vector3();
    }
    
    public reinitialiser(position?: THREE.Vector3): void {
        this.position.copy(position || this.positionInitiale);
        this.velocite.set(0, 0, 0);
        this.orientation.identity();
        this.velociteAngulaire.set(0, 0, 0);
    }
}
