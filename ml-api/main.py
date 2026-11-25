# ============================================================
# API de Machine Learning – Projet Deep Learning M2 DS
# NGONO BEPE Marguerite Claudelle
#
# Petite API séparée (FastAPI), utilisée par le frontend Angular (web/).
# Elle ne dépend pas du backend Django (rest/).
#   - Module 1 : classification d'images de maladies de peau (meilleur CNN du notebook 1)
#   - Module 2 : prévision du cours de Merck (MRK) sur 20 jours (NeuralProphet, notebook 2)
#
# Lancement :  python -m uvicorn main:app --port 8001 --reload
# Documentation interactive : http://127.0.0.1:8001/docs
# ============================================================
import os
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")      # évite un plantage PyTorch + OpenMP sous Windows

import base64                                              # image Grad-CAM renvoyée en texte (base64)
import io                                                  # lecture de l'image reçue en mémoire
import json                                                # lecture de classes.json
import math                                                # calcul de l'incertitude (entropie)
from datetime import date                                  # cache de la prévision (une fois par jour)

import numpy as np                                         # calculs sur les tableaux (Grad-CAM, erreurs)
import pandas as pd                                        # tableaux de données
import torch                                               # PyTorch
import torch.nn as nn                                      # couches de réseau
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware         # autorise le frontend Angular à appeler l'API
from fastapi.staticfiles import StaticFiles                # sert les images d'exemple et les graphiques
from PIL import Image                                      # ouverture des images
from torchvision import models, transforms                 # architectures CNN et transformations

DOSSIER = os.path.dirname(os.path.abspath(__file__))       # dossier de l'API
ARTEFACTS = os.path.join(DOSSIER, "artefacts")             # skin_model.pth, classes.json, merck_prices.csv
TICKER, HORIZON, N_LAGS = "MRK", 20, 60                    # action Merck, 20 jours, 60 jours d'historique

app = FastAPI(title="API Deep Learning – M2 DS",
              description="Classification de maladies de peau (CNN) et prévision du cours de Merck (NeuralProphet)")
app.add_middleware(CORSMiddleware,
                   allow_origins=os.environ.get("ML_API_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200").split(","),
                   allow_methods=["*"], allow_headers=["*"])

# Fichiers exportés par le notebook 1 (cellule 12-b) : images d'exemple et graphiques
DOSSIER_EXEMPLES = os.path.join(ARTEFACTS, "exemples")     # une ou deux images de test par maladie
DOSSIER_GRAPHIQUES = os.path.join(ARTEFACTS, "graphiques")  # comparaison, courbes, matrice de confusion
os.makedirs(DOSSIER_EXEMPLES, exist_ok=True)
os.makedirs(DOSSIER_GRAPHIQUES, exist_ok=True)
app.mount("/fichiers/exemples", StaticFiles(directory=DOSSIER_EXEMPLES), name="exemples")
app.mount("/fichiers/graphiques", StaticFiles(directory=DOSSIER_GRAPHIQUES), name="graphiques")
EXTENSIONS_IMAGES = (".jpg", ".jpeg", ".png", ".webp")


# ------------------------------------------------------------
# Module 1 : les mêmes modèles que dans le notebook 1 (étape 9)
# ------------------------------------------------------------
class SimpleCNN(nn.Module):
    """CNN fait maison : 4 blocs convolution -> normalisation -> ReLU -> réduction."""
    def __init__(self, num_classes):
        super().__init__()
        def bloc(e, s):
            return nn.Sequential(nn.Conv2d(e, s, 3, padding=1), nn.BatchNorm2d(s), nn.ReLU(), nn.MaxPool2d(2))
        self.features = nn.Sequential(bloc(3, 16), bloc(16, 32), bloc(32, 64), bloc(64, 128))
        self.classifier = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.3), nn.Linear(128, num_classes))
    def forward(self, x):
        return self.classifier(self.features(x))


def build_model(nom, num_classes):
    """Recrée l'architecture choisie dans le notebook (sans poids ImageNet : on charge ensuite nos poids)."""
    if nom == "simple_cnn":
        return SimpleCNN(num_classes)
    if nom == "mobilenet_v3_small":
        m = models.mobilenet_v3_small(weights=None)
        m.classifier[3] = nn.Linear(m.classifier[3].in_features, num_classes)
    elif nom == "mobilenet_v3_large":
        m = models.mobilenet_v3_large(weights=None)
        m.classifier[3] = nn.Linear(m.classifier[3].in_features, num_classes)
    elif nom == "shufflenet_v2":
        m = models.shufflenet_v2_x1_0(weights=None)
        m.fc = nn.Linear(m.fc.in_features, num_classes)
    elif nom == "regnet_y_400mf":
        m = models.regnet_y_400mf(weights=None)
        m.fc = nn.Linear(m.fc.in_features, num_classes)
    elif nom == "efficientnet_b0":
        m = models.efficientnet_b0(weights=None)
        m.classifier = nn.Sequential(nn.Dropout(0.3), nn.Linear(m.classifier[1].in_features, num_classes))
    elif nom == "resnet18":
        m = models.resnet18(weights=None)
        m.fc = nn.Sequential(nn.Dropout(0.3), nn.Linear(m.fc.in_features, num_classes))
    elif nom == "resnet50":
        m = models.resnet50(weights=None)
        m.fc = nn.Sequential(nn.Dropout(0.3), nn.Linear(m.fc.in_features, num_classes))
    elif nom == "densenet121":
        m = models.densenet121(weights=None)
        m.classifier = nn.Linear(m.classifier.in_features, num_classes)
    else:
        raise ValueError("Modèle inconnu : " + nom)
    return m



def couche_gradcam(modele, nom):
    """Dernière couche de convolution de chaque architecture : c'est elle que Grad-CAM observe."""
    if nom in ("resnet18", "resnet50"):
        return modele.layer4
    if nom == "densenet121":
        return modele.features.denseblock4                 # avant la ReLU « en place » de DenseNet
    if nom == "regnet_y_400mf":
        return modele.trunk_output
    if nom == "shufflenet_v2":
        return modele.conv5
    return modele.features                                 # mobilenet, efficientnet, simple_cnn


def calculer_gradcam(modele, couche, entree, classe):
    """Grad-CAM (Selvaraju et al., 2017) : carte des zones de l'image qui ont le plus pesé dans la décision."""
    memoire = {}

    def garder_sortie(_module, _entree, sortie):
        memoire["activations"] = sortie                     # cartes de caractéristiques de la couche
        sortie.register_hook(lambda grad: memoire.__setitem__("gradients", grad))   # leurs gradients

    accroche = couche.register_forward_hook(garder_sortie)
    try:
        modele.zero_grad(set_to_none=True)
        with torch.enable_grad():
            x = entree.clone().requires_grad_(True)
            scores = modele(x)                              # 5 scores
            scores[0, classe].backward()                    # gradient du score de la classe prédite
    finally:
        accroche.remove()
    activations = memoire["activations"][0].detach()        # (canaux, h, l)
    poids = memoire["gradients"][0].detach().mean(dim=(1, 2))   # importance de chaque canal
    carte = torch.relu((poids[:, None, None] * activations).sum(0))   # combinaison pondérée, valeurs positives
    carte = carte / (carte.max() + 1e-8)                    # entre 0 et 1
    return carte.cpu().numpy()


def palette_chaleur(v):
    """Palette « jet » simplifiée : bleu (faible) -> vert -> jaune -> rouge (fort)."""
    r = np.clip(1.5 - np.abs(4 * v - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * v - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * v - 1), 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def superposer_gradcam(image, carte, taille=320):
    """Superpose la carte de chaleur à l'image et renvoie un PNG en base64."""
    image = image.convert("RGB").resize((taille, taille))
    carte = Image.fromarray((carte * 255).astype(np.uint8)).resize((taille, taille), Image.BILINEAR)
    v = np.asarray(carte, dtype=np.float32) / 255.0
    chaleur = palette_chaleur(v).astype(np.float32)
    base = np.asarray(image, dtype=np.float32)
    alpha = (0.25 + 0.45 * v)[..., None]                    # plus la zone compte, plus la couleur est visible
    melange = (base * (1 - alpha) + chaleur * alpha).clip(0, 255).astype(np.uint8)
    tampon = io.BytesIO()
    Image.fromarray(melange).save(tampon, format="PNG")
    return "data:image/png;base64," + base64.b64encode(tampon.getvalue()).decode()


_classifieur = {}                                          # chargé une seule fois, au premier appel


def charger_classifieur():
    if _classifieur:
        return _classifieur
    try:
        with open(os.path.join(ARTEFACTS, "classes.json"), encoding="utf-8") as f:
            infos = json.load(f)                           # écrit par l'étape 14 du notebook 1
        modele = build_model(infos["arch"], len(infos["classes"]))
        modele.load_state_dict(torch.load(os.path.join(ARTEFACTS, "skin_model.pth"), map_location="cpu"))
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Modèle absent : copiez skin_model.pth et classes.json dans ml-api/artefacts/")
    modele.eval()
    taille = infos.get("img_size", 224)
    _classifieur.update(
        modele=modele,
        infos=infos,
        transformation=transforms.Compose([                # mêmes transformations que pour le test (étape 7-c)
            transforms.Resize((taille, taille)),
            transforms.ToTensor(),
            transforms.Normalize(infos.get("mean", [0.485, 0.456, 0.406]), infos.get("std", [0.229, 0.224, 0.225])),
        ]),
    )
    return _classifieur


@app.get("/")
def accueil():
    return {"message": "API Deep Learning en ligne", "documentation": "/docs"}


@app.get("/classification/info")
def info_classification():
    """Informations sur le modèle retenu : architecture, classes et scores."""
    infos = charger_classifieur()["infos"]
    return {
        "architecture": infos["arch"],                                 # modèle retenu dans le notebook 1
        "classes": infos["classes"],                                   # noms complets des 5 maladies
        "noms_courts": infos.get("noms_courts", infos["classes"]),     # noms courts (affichage)
        "taille_image": infos.get("img_size", 224),                    # taille d'entrée du CNN
        "f1_validation": infos.get("val_f1_macro"),                    # anciens champs (toujours fournis)
        "accuracy_test": infos.get("test_accuracy"),
        "f1_test": infos.get("test_f1_macro"),
        "critere_choix": infos.get("critere_choix"),                   # comment le modèle a été choisi
        "score_validation": infos.get("score_validation"),             # score global sur la validation
        "score_test": infos.get("score_test"),                         # score global sur le test
        "metriques_test": infos.get("metriques_test", {}),             # les 7 critères sur le test
        "ic_test": infos.get("ic_test", {}),                           # intervalles de confiance à 95 %
        "rappel_par_classe_test": infos.get("rappel_par_classe_test", {}),   # sensibilité de chaque maladie
        "nb_images_test": infos.get("nb_images_test"),                 # taille du jeu de test
        "comparaison": infos.get("comparaison", []),                   # tableau des 9 CNN (section 10-b)
    }


@app.post("/classification/predire")
async def predire(fichier: UploadFile = File(...), gradcam: bool = True):
    """Reçoit une image ; renvoie la maladie prédite, la probabilité de chaque classe et la carte Grad-CAM."""
    c = charger_classifieur()
    try:
        image = Image.open(io.BytesIO(await fichier.read())).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Le fichier envoyé n'est pas une image valide")
    entree = c["transformation"](image).unsqueeze(0)       # (1, 3, 224, 224)
    with torch.no_grad():
        probas = torch.softmax(c["modele"](entree), dim=1)[0].tolist()
    infos = c["infos"]
    noms_courts = infos.get("noms_courts", infos["classes"])
    resultats = sorted(
        ({"classe": cl, "nom_court": nc, "probabilite": round(p, 4)}
         for cl, nc, p in zip(infos["classes"], noms_courts, probas)),
        key=lambda r: r["probabilite"], reverse=True)       # de la plus probable à la moins probable

    # Incertitude : entropie normalisée (0 = sûr de lui, 1 = répond au hasard)
    entropie = -sum(p * math.log(p) for p in probas if p > 0) / math.log(len(probas))
    ecart_top2 = resultats[0]["probabilite"] - resultats[1]["probabilite"]
    if resultats[0]["probabilite"] < 0.4 or entropie > 0.8:
        avis = "tres_incertain"                             # image hors sujet ou très ambiguë
    elif resultats[0]["probabilite"] < 0.6 or ecart_top2 < 0.15:
        avis = "hesitant"                                   # deux maladies possibles
    else:
        avis = "confiant"

    carte = None
    if gradcam:
        try:
            classe = int(np.argmax(probas))
            carte = superposer_gradcam(image, calculer_gradcam(c["modele"], couche_gradcam(c["modele"], infos["arch"]), entree, classe))
        except Exception:
            carte = None                                    # la prédiction reste valable sans la carte
    return {"prediction": resultats[0], "probabilites": resultats, "architecture": infos["arch"],
            "incertitude": round(entropie, 4), "avis": avis, "gradcam": carte}


@app.get("/classification/exemples")
def exemples():
    """Images de test exportées par le notebook (cellule 12-b), pour essayer l'application en un clic."""
    fichiers = sorted(f for f in os.listdir(DOSSIER_EXEMPLES) if f.lower().endswith(EXTENSIONS_IMAGES))
    liste = []
    for f in fichiers:
        classe = f.rsplit("__", 1)[0].replace("_", " ")     # nom de fichier : <Classe>__<n>.jpg
        liste.append({"classe": classe, "fichier": f, "url": f"/fichiers/exemples/{f}"})
    return liste


@app.get("/classification/graphiques")
def graphiques():
    """Graphiques du notebook (cellule 12-b) : comparaison des CNN, courbes, matrice de confusion."""
    titres = {}
    chemin_titres = os.path.join(DOSSIER_GRAPHIQUES, "titres.json")
    if os.path.exists(chemin_titres):
        with open(chemin_titres, encoding="utf-8") as f:
            titres = json.load(f)                           # {"fichier.png": {"titre": ..., "description": ...}}
    fichiers = sorted(f for f in os.listdir(DOSSIER_GRAPHIQUES) if f.lower().endswith(EXTENSIONS_IMAGES))
    return [{"fichier": f, "url": f"/fichiers/graphiques/{f}",
             "titre": titres.get(f, {}).get("titre", f.rsplit(".", 1)[0].replace("_", " ")),
             "description": titres.get(f, {}).get("description", "")} for f in fichiers]


# ------------------------------------------------------------
# Module 2 : prévision Merck (mêmes réglages que le notebook 2)
# ------------------------------------------------------------
_cache_prevision = {"jour": None, "resultat": None}         # recalculée une fois par jour


def charger_cours():
    """Cours de Merck depuis Yahoo Finance ; sinon la copie de secours merck_prices.csv."""
    try:
        import yfinance as yf
        brut = yf.download(TICKER, start="2015-01-01", auto_adjust=True, progress=False)
        close = brut["Close"]
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]
        df = close.reset_index()
        df.columns = ["ds", "y"]
        if len(df) < 500:
            raise ValueError("données insuffisantes")
        source = "Yahoo Finance"
    except Exception:
        df = pd.read_csv(os.path.join(ARTEFACTS, "merck_prices.csv"))
        source = "merck_prices.csv (Yahoo Finance indisponible)"
    df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
    df = df.dropna().reset_index(drop=True)
    df = df[df["ds"].dt.date < pd.Timestamp.now(tz="America/New_York").date()].reset_index(drop=True)   # séance en cours retirée
    return df, source


def prevoir_20_jours(df):
    """Entraîne NeuralProphet (mêmes réglages que le notebook 2) et renvoie les 20 jours ouvrés suivants."""
    from neuralprophet import NeuralProphet, set_log_level, set_random_seed
    set_log_level("ERROR")
    set_random_seed(42)                                     # résultats reproductibles
    m = NeuralProphet(n_lags=N_LAGS, n_forecasts=HORIZON, yearly_seasonality=True,
                      weekly_seasonality=False, daily_seasonality=False,
                      epochs=60, batch_size=64, learning_rate=0.01)   # learning_rate fixé (PyTorch récent)
    m.fit(df, freq="B", progress=None)
    prev = m.predict(m.make_future_dataframe(df, periods=HORIZON, n_historic_predictions=False))
    fut = prev[prev["ds"] > df["ds"].max()].reset_index(drop=True)
    return [(fut.loc[i, "ds"], float(fut.loc[i, f"yhat{i + 1}"])) for i in range(len(fut))]


def erreurs(reels, prevus):
    """MAE, RMSE et MAPE entre les vrais prix et les prix prévus."""
    reels, prevus = np.asarray(reels, dtype=float), np.asarray(prevus, dtype=float)
    ecart = prevus - reels
    return {"mae": round(float(np.mean(np.abs(ecart))), 3),                        # erreur moyenne en dollars
            "rmse": round(float(np.sqrt(np.mean(ecart ** 2))), 3),                 # pénalise les grosses erreurs
            "mape": round(float(np.mean(np.abs(ecart) / reels) * 100), 3)}         # erreur moyenne en %


def backtest(df):
    """On cache les 20 derniers jours connus, on les prévoit, puis on compare avec ce qui s'est vraiment passé."""
    apprentissage, verite = df.iloc[:-HORIZON].reset_index(drop=True), df.iloc[-HORIZON:].reset_index(drop=True)
    prevus = [p for _, p in prevoir_20_jours(apprentissage)][:len(verite)]
    reels = verite["y"].tolist()[:len(prevus)]
    naif = [float(apprentissage["y"].iloc[-1])] * len(prevus)   # référence naïve : le dernier prix est répété
    return {
        "debut": str(verite["ds"].iloc[0].date()),
        "fin": str(verite["ds"].iloc[len(prevus) - 1].date()),
        "points": [{"date": str(verite.loc[i, "ds"].date()), "reel": round(reels[i], 2), "prevu": round(prevus[i], 2)}
                   for i in range(len(prevus))],
        "neuralprophet": erreurs(reels, prevus),            # erreurs du modèle
        "naif": erreurs(reels, naif),                       # erreurs de la référence naïve
    }


@app.get("/prevision/merck")
def prevision_merck():
    """Historique de la dernière année, prévision des 20 prochains jours ouvrés et backtest sur les 20 derniers jours."""
    if _cache_prevision["jour"] == date.today():
        return _cache_prevision["resultat"]
    df, source = charger_cours()
    futur = prevoir_20_jours(df)                            # prévision des 20 prochains jours
    try:
        controle = backtest(df)                             # fiabilité mesurée sur les 20 derniers jours connus
    except Exception:
        controle = None                                     # la prévision reste affichée sans le backtest
    historique = df.tail(250)
    resultat = {
        "action": TICKER,
        "source": source,
        "horizon": HORIZON,
        "dernier_cours": round(float(df["y"].iloc[-1]), 2),
        "derniere_date": str(df["ds"].max().date()),
        "historique": [{"date": str(d.date()), "prix": round(float(p), 2)}
                       for d, p in zip(historique["ds"], historique["y"])],
        "previsions": [{"jour": i + 1, "date": str(d.date()), "prix": round(p, 2)} for i, (d, p) in enumerate(futur)],
        "backtest": controle,
    }
    _cache_prevision.update(jour=date.today(), resultat=resultat)
    return resultat
