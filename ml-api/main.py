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

import io                                                  # lecture de l'image reçue en mémoire
import json                                                # lecture de classes.json
from datetime import date                                  # cache de la prévision (une fois par jour)

import pandas as pd                                        # tableaux de données
import torch                                               # PyTorch
import torch.nn as nn                                      # couches de réseau
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware         # autorise le frontend Angular à appeler l'API
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
async def predire(fichier: UploadFile = File(...)):
    """Reçoit une image et renvoie la maladie prédite avec la probabilité de chaque classe."""
    c = charger_classifieur()
    try:
        image = Image.open(io.BytesIO(await fichier.read())).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Le fichier envoyé n'est pas une image valide")
    with torch.no_grad():
        probas = torch.softmax(c["modele"](c["transformation"](image).unsqueeze(0)), dim=1)[0].tolist()
    infos = c["infos"]
    noms_courts = infos.get("noms_courts", infos["classes"])
    resultats = sorted(
        ({"classe": cl, "nom_court": nc, "probabilite": round(p, 4)}
         for cl, nc, p in zip(infos["classes"], noms_courts, probas)),
        key=lambda r: r["probabilite"], reverse=True)       # de la plus probable à la moins probable
    return {"prediction": resultats[0], "probabilites": resultats, "architecture": infos["arch"]}


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


@app.get("/prevision/merck")
def prevision_merck():
    """Historique de la dernière année et prévision NeuralProphet des 20 prochains jours ouvrés."""
    if _cache_prevision["jour"] == date.today():
        return _cache_prevision["resultat"]
    from neuralprophet import NeuralProphet, set_log_level, set_random_seed
    set_log_level("ERROR")
    set_random_seed(42)
    df, source = charger_cours()
    m = NeuralProphet(n_lags=N_LAGS, n_forecasts=HORIZON, yearly_seasonality=True,
                      weekly_seasonality=False, daily_seasonality=False,
                      epochs=60, batch_size=64, learning_rate=0.01)   # learning_rate fixé (PyTorch récent)
    m.fit(df, freq="B", progress=None)
    prev = m.predict(m.make_future_dataframe(df, periods=HORIZON, n_historic_predictions=False))
    fut = prev[prev["ds"] > df["ds"].max()].reset_index(drop=True)
    historique = df.tail(250)
    resultat = {
        "action": TICKER,
        "source": source,
        "horizon": HORIZON,
        "dernier_cours": round(float(df["y"].iloc[-1]), 2),
        "derniere_date": str(df["ds"].max().date()),
        "historique": [{"date": str(d.date()), "prix": round(float(p), 2)}
                       for d, p in zip(historique["ds"], historique["y"])],
        "previsions": [{"jour": i + 1, "date": str(fut.loc[i, "ds"].date()),
                        "prix": round(float(fut.loc[i, f"yhat{i + 1}"]), 2)} for i in range(len(fut))],
    }
    _cache_prevision.update(jour=date.today(), resultat=resultat)
    return resultat
