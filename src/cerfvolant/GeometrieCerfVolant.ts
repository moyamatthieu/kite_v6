import * as THREE from 'three';

export interface ParametresBrides {
    nez: number;
    inter: number;
    centre: number;
}

export interface ParametresGeometrie {
    envergure: number;
    hauteur: number;
    profondeur: number;
    diametreStructure: number;
    parametresBrides: ParametresBrides;
}

/**
 * Calcule et stocke la géométrie d'un cerf-volant (points, connexions, panneaux).
 * C'est le "plan de construction" du cerf-volant.
 */
export class GeometrieCerfVolant {
    public points = new Map<string, THREE.Vector3>();
    public connexions: [string, string][] = [];
    public panneaux: string[][] = [];

    // Paramètres par défaut
    public envergure = 1.65;
    public hauteur = 0.65;
    public profondeur = 0.15;
    public diametreStructure = 0.01;
    public parametresBrides: ParametresBrides = {
        nez: 0.65,      // Longueur de la bride du nez au point de contrôle
        inter: 0.65,    // Longueur de la bride du point intermédiaire au point de contrôle
        centre: 0.65    // Longueur de la bride du centre au point de contrôle
    };

    constructor(parametres?: Partial<ParametresGeometrie>) {
        if (parametres) {
            this.mettreAJourParametres(parametres);
        } else {
            this.calculerGeometrie();
        }
    }

    /**
     * Met à jour les paramètres de la géométrie et la recalcule.
     */
    public mettreAJourParametres(nouveauxParametres: Partial<ParametresGeometrie>): void {
        Object.assign(this, nouveauxParametres);
        this.calculerGeometrie();
    }

    /**
     * Calcule tous les points, connexions et panneaux à partir des paramètres.
     */
    private calculerGeometrie(): void {
        this.points.clear();
        this.definirPoints();
        this.definirConnexions();
        this.definirPanneaux();
    }

    private definirPoints(): void {
        const { envergure, hauteur, profondeur, parametresBrides } = this;

        // Points structurels principaux
        const nez = new THREE.Vector3(0, hauteur, 0);
        const spineBas = new THREE.Vector3(0, 0, 0);
        const bordGauche = new THREE.Vector3(-envergure / 2, 0, 0);
        const bordDroit = new THREE.Vector3(envergure / 2, 0, 0);

        // Points intermédiaires
        const ratioInter = (hauteur - (hauteur / 4)) / hauteur;
        const interGauche = new THREE.Vector3(ratioInter * (-envergure / 2), hauteur / 4, 0);
        const interDroit = new THREE.Vector3(ratioInter * (envergure / 2), hauteur / 4, 0);
        const centre = new THREE.Vector3(0, hauteur / 4, 0);
        
        // Points whiskers (stabilisateurs)
        const whiskerGauche = new THREE.Vector3(-envergure / 4, 0.1, -profondeur);
        const whiskerDroit = new THREE.Vector3(envergure / 4, 0.1, -profondeur);

        // Calcul des points de contrôle des brides par trilatération
        const ctrlGauche = this.calculerPointControle(nez, interGauche, centre, parametresBrides);
        const ctrlDroit = this.calculerPointControle(nez, interDroit, centre, parametresBrides);

        // Vérification des distances (debug)
        this.verifierDistancesBrides(nez, interGauche, centre, ctrlGauche, parametresBrides);

        this.points.set('NEZ', nez);
        this.points.set('SPINE_BAS', spineBas);
        this.points.set('BORD_GAUCHE', bordGauche);
        this.points.set('BORD_DROIT', bordDroit);
        this.points.set('INTER_GAUCHE', interGauche);
        this.points.set('INTER_DROIT', interDroit);
        this.points.set('CENTRE', centre);
        this.points.set('WHISKER_GAUCHE', whiskerGauche);
        this.points.set('WHISKER_DROIT', whiskerDroit);
        this.points.set('CTRL_GAUCHE', ctrlGauche);
        this.points.set('CTRL_DROIT', ctrlDroit);
    }

    private definirConnexions(): void {
        this.connexions = [
            ['NEZ', 'SPINE_BAS'],
            ['NEZ', 'BORD_GAUCHE'],
            ['NEZ', 'BORD_DROIT'],
            ['INTER_GAUCHE', 'INTER_DROIT'],
            ['BORD_GAUCHE', 'WHISKER_GAUCHE'],
            ['BORD_DROIT', 'WHISKER_DROIT'],
        ];
    }

    private definirPanneaux(): void {
        this.panneaux = [
            // L'ordre des sommets définit la normale via la règle de la main droite (v1 × v2)
            // où v1 = points[1] - points[0] et v2 = points[2] - points[0]
            // Les panneaux sont définis dans le sens qui génère des normales cohérentes
            ['NEZ', 'WHISKER_GAUCHE', 'BORD_GAUCHE'], // Panneau 1 (gauche)
            ['NEZ', 'SPINE_BAS', 'WHISKER_GAUCHE'],   // Panneau 2 (arrière gauche)
            ['NEZ', 'BORD_DROIT', 'WHISKER_DROIT'],   // Panneau 3 (droite)
            ['NEZ', 'WHISKER_DROIT', 'SPINE_BAS'],    // Panneau 4 (arrière droit)
        ];
    }
    
    /**
     * Calcule la position d'un point de contrôle (CTRL) par trilatération 3D.
     * Trouve l'intersection de 3 sphères.
     */
    private calculerPointControle(
        p1: THREE.Vector3, // NEZ
        p2: THREE.Vector3, // INTER
        p3: THREE.Vector3, // CENTRE
        brides: ParametresBrides
    ): THREE.Vector3 {
        const r1 = brides.nez;
        const r2 = brides.inter;
        const r3 = brides.centre;

        // On construit une base locale (ex, ey, ez) à partir des points d'attache
        const ex = new THREE.Vector3().subVectors(p2, p1).normalize();
        const i = ex.dot(new THREE.Vector3().subVectors(p3, p1));
        const ey = new THREE.Vector3().subVectors(p3, p1).addScaledVector(ex, -i).normalize();
        // ez est perpendiculaire au plan formé par les points d'attache de la bride
        const ez = new THREE.Vector3().crossVectors(ex, ey);
        const d = p1.distanceTo(p2);
        const j = ey.dot(new THREE.Vector3().subVectors(p3, p1));

        // Calcul des coordonnées (x, y) dans le plan (ex, ey) par trilatération
        const x = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const y = (r1 * r1 - r3 * r3 + i * i + j * j - 2 * i * x) / (2 * j);
        
        // Calcul de la coordonnée z (distance par rapport au plan)
        const zSq = r1 * r1 - x * x - y * y;
        const z = zSq > 0 ? Math.sqrt(zSq) : 0;

        // Il y a deux solutions : +z et -z dans la base locale
        // On choisit celle qui place le point de contrôle DEVANT le kite (+Z dans le repère monde)
        const pointLocalPlus = new THREE.Vector3(x, y, z);
        const pointLocalMoins = new THREE.Vector3(x, y, -z);
        
        const base = new THREE.Matrix4().makeBasis(ex, ey, ez);
        const candidatPlus = pointLocalPlus.clone().applyMatrix4(base).add(p1);
        const candidatMoins = pointLocalMoins.clone().applyMatrix4(base).add(p1);
        
        // On choisit le candidat avec la plus grande coordonnée Z (devant)
        return candidatPlus.z > candidatMoins.z ? candidatPlus : candidatMoins;
    }

    /**
     * Vérifie que les distances calculées correspondent aux paramètres des brides.
     */
    private verifierDistancesBrides(
        nez: THREE.Vector3,
        inter: THREE.Vector3,
        centre: THREE.Vector3,
        ctrl: THREE.Vector3,
        parametres: ParametresBrides
    ): void {
        const distNez = nez.distanceTo(ctrl);
        const distInter = inter.distanceTo(ctrl);
        const distCentre = centre.distanceTo(ctrl);

        console.log('=== Vérification des brides ===');
        console.log(`NEZ→CTRL: demandé=${parametres.nez.toFixed(3)}m, calculé=${distNez.toFixed(3)}m, erreur=${Math.abs(distNez - parametres.nez).toFixed(4)}m`);
        console.log(`INTER→CTRL: demandé=${parametres.inter.toFixed(3)}m, calculé=${distInter.toFixed(3)}m, erreur=${Math.abs(distInter - parametres.inter).toFixed(4)}m`);
        console.log(`CENTRE→CTRL: demandé=${parametres.centre.toFixed(3)}m, calculé=${distCentre.toFixed(3)}m, erreur=${Math.abs(distCentre - parametres.centre).toFixed(4)}m`);
        console.log(`Position CTRL: x=${ctrl.x.toFixed(3)}, y=${ctrl.y.toFixed(3)}, z=${ctrl.z.toFixed(3)}`);
    }
}