from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import pymysql
import pandas as pd
import pickle
import os

app = Flask(__name__)
CORS(app)

# Configuration
app.config['MYSQL_HOST'] = '192.168.2.100'
app.config['MYSQL_USER'] = 'remote'
app.config['MYSQL_PASSWORD'] = 'Vista2022'
app.config['MYSQL_DB'] = 'vista_solutions_tdb'
app.config['JWT_SECRET_KEY'] = 'votre-secret-key'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=10)

# Configuration 2
app.config['MYSQL_HOST2'] = 'localhost'
app.config['MYSQL_USER2'] = 'root'
app.config['MYSQL_PASSWORD2'] = ''
app.config['MYSQL_DB2'] = 'vista_db'

jwt = JWTManager(app)

# Chargement du modèle
model_path = os.path.join(os.path.dirname(__file__), 'models', 'modele_prediction_inactivite.pkl')
with open(model_path, 'rb') as f:
    model = pickle.load(f)

def get_db():
    return pymysql.connect(
        host=app.config['MYSQL_HOST'],
        user=app.config['MYSQL_USER'],
        password=app.config['MYSQL_PASSWORD'],
        db=app.config['MYSQL_DB'],
        cursorclass=pymysql.cursors.DictCursor
    )

def get_db2():
    return pymysql.connect(
        host=app.config['MYSQL_HOST2'],
        user=app.config['MYSQL_USER2'],
        password=app.config['MYSQL_PASSWORD2'],
        db=app.config['MYSQL_DB2'],
        cursorclass=pymysql.cursors.DictCursor
    )

# Route d'authentification
@app.route('/auth/login', methods=['POST'])
def login():
    data = request.json
    if not data or not all(k in data for k in ['username', 'password']):
        return jsonify({'error': 'Données manquantes'}), 400

    conn = get_db2()
    cur = conn.cursor()

    try:
        cur.execute("SELECT * FROM users WHERE username = %s AND password = %s",
                    (data['username'], data['password']))
        user = cur.fetchone()

        if user:
            access_token = create_access_token(identity=user['username'])
            return jsonify({
                'token': access_token,
                'user': {
                    'username': user['username'],
                    'name': user['name']
                }
            })

        return jsonify({'error': 'Identifiants invalides'}), 401

    finally:
        cur.close()
        conn.close()

# Route des inscriptions
@app.route('/inscriptions', methods=['GET'])
@jwt_required()
def get_inscriptions():
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if not start_date or not end_date:
            return jsonify({'error': 'Les dates de début et de fin sont requises'}), 400

        conn = get_db()
        cur = conn.cursor()

        try:
            query = """
                SELECT
                    NUMERO_SIM_ORANGE_MONEY AS id_marchand,
                    RAISON_SOCIALE,
                    TYPE_MARCHAND,
                    RCCM,
                    NIF,
                    SECTEUR_ACTIVITE,
                    VILLE,
                    QUARTIER,
                    DATE_INSCRIPTION,
                    ETAT,
                    NOM_REPRESENTANT_LEGAL,
                    TEL_REPRESENTANT_LEGAL
                FROM inscriptions
                WHERE DATE_INSCRIPTION BETWEEN %s AND %s AND ETAT = "Validée"
            """
            cur.execute(query, (start_date, end_date))
            inscriptions = cur.fetchall()

            return jsonify({
                'inscriptions': [{
                    'id_marchand': i['id_marchand'],
                    'raison_sociale': i['RAISON_SOCIALE'],
                    'type_marchand': i['TYPE_MARCHAND'],
                    'rccm': i['RCCM'],
                    'nif': i['NIF'],
                    'secteur_activite': i['SECTEUR_ACTIVITE'],
                    'ville': i['VILLE'],
                    'quartier': i['QUARTIER'],
                    'date_inscription': i['DATE_INSCRIPTION'].isoformat() if i['DATE_INSCRIPTION'] else None,
                    'etat': i['ETAT'],
                    'nom_representant': i['NOM_REPRESENTANT_LEGAL'],
                    'tel_representant': i['TEL_REPRESENTANT_LEGAL']
                } for i in inscriptions]
            })

        finally:
            cur.close()
            conn.close()

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Route de prédiction
@app.route('/predict/inactive-merchants', methods=['POST'])
@jwt_required()
def predict_inactive_merchants():
    try:
        data = request.json
        marchands_ids = data.get('marchands_ids', [])

        if not marchands_ids:
            return jsonify({'error': 'Aucun marchand sélectionné'}), 400

        conn = get_db()
        cur = conn.cursor()

        try:
            # Convertir les IDs en tuple pour la requête SQL
            ids_tuple = tuple(marchands_ids)

            # Requête SQL modifiée pour récupérer les features et les informations nécessaires
            query = """
                SELECT
                    t.Num_de_Compte_Agent AS id_marchand,
                    i.RAISON_SOCIALE AS raison_sociale,
                    COUNT(*) AS tx_count_30j,
                    SUM(CASE
                        WHEN t.Montant_Credit IS NOT NULL THEN t.Montant_Credit
                        ELSE CAST(t.Montant_Debit AS DOUBLE)
                    END) AS tx_sum_30j,
                    AVG(CASE
                        WHEN t.Montant_Credit IS NOT NULL THEN t.Montant_Credit
                        ELSE CAST(t.Montant_Debit AS DOUBLE)
                    END) AS tx_avg_30j,
                    DATEDIFF(CURDATE(), MAX(t.Date_Transactions)) AS recence,
                    COUNT(DISTINCT DATE(t.Date_Transactions)) AS nb_jours_actifs_30j,
                    MAX(CASE
                        WHEN t.Montant_Credit IS NOT NULL THEN t.Montant_Credit
                        ELSE CAST(t.Montant_Debit AS DOUBLE)
                    END) AS montant_max_tx,
                    STDDEV(CASE
                        WHEN t.Montant_Credit IS NOT NULL THEN t.Montant_Credit
                        ELSE CAST(t.Montant_Debit AS DOUBLE)
                    END) AS ecart_type_montant,
                    MAX(t.Date_Transactions) AS last_transaction_date,
                    SUM(CASE
                        WHEN t.Date_Transactions >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1
                        ELSE 0
                    END) AS transaction_count_last_30_days,
                    (SELECT
                        CASE
                            WHEN lt.Montant_Debit IS NOT NULL THEN CAST(lt.Montant_Debit AS DOUBLE)
                            ELSE lt.Montant_Credit
                        END
                     FROM transactions lt
                     WHERE lt.Num_de_Compte_Agent = t.Num_de_Compte_Agent
                       AND lt.Operation_Paiement = 'Transaction'
                       AND lt.Statut = 'Succès'
                     ORDER BY lt.Date_Transactions DESC
                     LIMIT 1) AS last_transaction_amount,
                    (SELECT
                        CASE
                            WHEN lt.Montant_Debit IS NOT NULL THEN '-'
                            ELSE '+'
                        END
                     FROM transactions lt
                     WHERE lt.Num_de_Compte_Agent = t.Num_de_Compte_Agent
                       AND lt.Operation_Paiement = 'Transaction'
                       AND lt.Statut = 'Succès'
                     ORDER BY lt.Date_Transactions DESC
                     LIMIT 1) AS last_transaction_type
                FROM transactions t
                JOIN inscriptions i ON t.Num_de_Compte_Agent = i.NUMERO_SIM_ORANGE_MONEY
                WHERE t.Num_de_Compte_Agent IN %s
                  AND t.Operation_Paiement = 'Transaction'
                  AND t.Statut = 'Succès'
                GROUP BY t.Num_de_Compte_Agent, i.RAISON_SOCIALE
            """
            cur.execute(query, (ids_tuple,))
            rows = cur.fetchall()

            if not rows:
                return jsonify({'inactive_merchants': []})

            # Colonnes et DataFrame
            columns = [desc[0] for desc in cur.description]
            df = pd.DataFrame(rows, columns=columns)

            # Données d'entrée pour le modèle
            features = df[['tx_count_30j', 'tx_sum_30j', 'tx_avg_30j', 'recence',
                           'nb_jours_actifs_30j', 'montant_max_tx', 'ecart_type_montant']].fillna(0)

            # Prédictions
            predictions = model.predict(features)

            # Scores de proba (si dispo)
            if hasattr(model, 'predict_proba'):
                proba_scores = model.predict_proba(features)[:, 1]  # proba que ça soit 1 (inactif)
            else:
                proba_scores = [0.0] * len(predictions)

            # Filtrer uniquement les inactifs et ajouter les informations supplémentaires
            inactive_merchants = []
            for idx, pred in enumerate(predictions):
                if pred == 1:
                    merchant_data = df.iloc[idx]
                    last_transaction_date = merchant_data['last_transaction_date']
                    last_transaction_amount = merchant_data['last_transaction_amount']
                    last_transaction_type = merchant_data['last_transaction_type']
                    transaction_count_last_30_days = merchant_data['transaction_count_last_30_days']

                    formatted_last_transaction = ""
                    if last_transaction_amount is not None:
                        sign = ""
                        color = ""
                        if last_transaction_type == '+':
                            sign = "+"
                            color = "green"
                        elif last_transaction_type == '-':
                            sign = "-"
                            color = "red"
                        formatted_last_transaction = f'<span style="color:{color};">{sign}{float(last_transaction_amount):.2f}</span> - '
                    elif last_transaction_date is not None:
                        formatted_last_transaction = '- ' # Indiquer une dernière date mais sans montant

                    inactive_merchants.append({
                        'id_marchand': int(merchant_data['id_marchand']),
                        'raison_sociale': merchant_data['raison_sociale'],
                        'risque': round(float(proba_scores[idx]), 4),
                        'derniere_transaction': formatted_last_transaction + (last_transaction_date.isoformat() if last_transaction_date else None),
                        'nombre_transactions_30_jours': int(transaction_count_last_30_days)
                    })

            return jsonify({'inactive_merchants': inactive_merchants})

        finally:
            cur.close()
            conn.close()

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5001, debug=True)