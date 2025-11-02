import * as THREE from 'three';

/**
 * Gère l'état et la représentation visuelle de la station de contrôle au sol.
 * 
 * ORIENTATION GLOBALE:
 * - La station fait face au vent qui souffle de X+ vers X-
 * - L'avant de la station (face au vent) pointe vers X+
 * - Les treuils sont à l'ARRIÈRE de la station (côté X+) pour que les lignes 
 *   partent vers le cerf-volant qui vole dans le vent
 * - Le treuil GAUCHE est situé en Z- (côté négatif de l'axe Z global)
 * - Le treuil DROIT est situé en Z+ (côté positif de l'axe Z global)
 * 
 * CONSIGNES: Pas de comportements scriptés. Les comportements doivent émerger de la physique de la simulation.
 */
export class StationControle {
    public objet3D: THREE.Group;
    public position: THREE.Vector3;
    private largeurTreuils = 0.3; // Distance entre les treuils en mètres
    private dernierePositionCerfVolant = new THREE.Vector3();

    constructor() {
        this.position = new THREE.Vector3(0, 0.25, 0); // Centre à y=0.25, base au sol (y=0)
        this.objet3D = new THREE.Group();
        this.objet3D.position.copy(this.position);

        this.construireStation();
        this.construireTreuils();
    }
    
    /**
     * Construit le corps principal de la station (cube gris).
     */
    private construireStation(): void {
        const geometrie = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const materiau = new THREE.MeshStandardMaterial({ 
            color: 0xaaaaaa, 
            metalness: 0.8, 
            roughness: 0.4 
        });
        const station = new THREE.Mesh(geometrie, materiau);
        station.castShadow = true;
        this.objet3D.add(station);
    }
    
    /**
     * Construit les deux treuils (cubes bleus cyan) aux positions globales finales.
     * Les treuils sont directement positionnés dans le repère GLOBAL pour éviter
     * toute confusion liée aux rotations.
     * Ils sont placés à l'ARRIÈRE de la station (côté X+) pour que les lignes
     * partent vers le cerf-volant qui vole dans le vent.
     */
    private construireTreuils(): void {
        const geometrie = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const materiau = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff, // Bleu cyan vif
            metalness: 0.9, 
            roughness: 0.2 
        });
        
        // Treuil GAUCHE: Position globale finale (X+, Y-, au-dessus de la station)
        const treuilGauche = new THREE.Mesh(geometrie, materiau);
        treuilGauche.position.set(0.25, 0.25, -this.largeurTreuils / 2);
        treuilGauche.name = 'TreuilGauche';
        this.objet3D.add(treuilGauche);

        // Treuil DROIT: Position globale finale (X+, Y+, au-dessus de la station)
        const treuilDroit = new THREE.Mesh(geometrie, materiau);
        treuilDroit.position.set(0.25, 0.25, this.largeurTreuils / 2);
        treuilDroit.name = 'TreuilDroit';
        this.objet3D.add(treuilDroit);
    }
    
    /**
     * Met à jour l'orientation de la station pour qu'elle fasse face au cerf-volant.
     * DÉSACTIVÉ: La station reste fixe pour l'instant.
     */
    public mettreAJour(positionCerfVolant: THREE.Vector3): void {
        this.dernierePositionCerfVolant.copy(positionCerfVolant);
        // La station reste fixe, pas de rotation dynamique
    }
    
    /**
     * Retourne les positions globales des deux treuils.
     */
    public getPositionsPoignees(): { gauche: THREE.Vector3, droite: THREE.Vector3 } {
        // Récupération par nom pour éviter toute confusion d'index
        const treuilGauche = this.objet3D.getObjectByName('TreuilGauche') as THREE.Mesh;
        const treuilDroit = this.objet3D.getObjectByName('TreuilDroit') as THREE.Mesh;
        
        const posGauche = new THREE.Vector3();
        const posDroite = new THREE.Vector3();
        
        treuilGauche.getWorldPosition(posGauche);
        treuilDroit.getWorldPosition(posDroite);

        return {
            gauche: posGauche,
            droite: posDroite,
        };
    }
    
    /**
     * Réinitialise la position de la station à l'origine.
     */
    public reinitialiser(): void {
        this.position.set(0, 0.25, 0);
        this.objet3D.position.copy(this.position);
        this.objet3D.rotation.set(0, 0, 0); // Pas de rotation
    }
}