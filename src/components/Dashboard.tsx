import React, { useState, useEffect } from 'react';
import { Calendar, Search, AlertTriangle, LogOut, Activity, Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

interface Inscription {
  id_marchand: number;
  raison_sociale: string;
  type_marchand: string;
  rccm: string;
  nif: string;
  secteur_activite: string;
  ville: string;
  quartier: string;
  date_inscription: string;
  etat: string;
  nom_representant: string;
  tel_representant: string;
}

interface InactiveMerchant {
  id_marchand: number;
  raison_sociale: string;
  risque: number;
  derniere_transaction: string | null;
  nombre_transactions_30_jours: number;
}

export function Dashboard() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [inscriptions, setInscriptions] = useState<Inscription[]>([]);
  const [filteredInscriptions, setFilteredInscriptions] = useState<Inscription[]>([]);
  const [selectedMerchants, setSelectedMerchants] = useState<number[]>([]);
  const [inactiveMerchants, setInactiveMerchants] = useState<InactiveMerchant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const { token, user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Filtrer les inscriptions selon le terme de recherche
  useEffect(() => {
    const filtered = inscriptions.filter(inscription =>
      inscription.raison_sociale.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inscription.nom_representant.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inscription.tel_representant.includes(searchTerm) ||
      inscription.id_marchand.toString().includes(searchTerm)
    );
    setFilteredInscriptions(filtered);
  }, [searchTerm, inscriptions]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const validateDates = () => {
    if (!startDate || !endDate) {
      setError('Veuillez sélectionner une date de début et de fin');
      return false;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      setError('La date de début doit être antérieure à la date de fin');
      return false;
    }
    
    return true;
  };

  const fetchInscriptions = async () => {
    try {
      if (!validateDates()) return;
      
      setLoading(true);
      setError('');
      setSuccessMessage('');
      
      const response = await fetch(
        `http://localhost:5001/inscriptions?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (!response.ok) throw new Error('Erreur lors de la récupération des inscriptions');
      
      const data = await response.json();
      setInscriptions(data.inscriptions);
      setFilteredInscriptions(data.inscriptions);
      setSelectedMerchants([]);
      setInactiveMerchants([]);
      setSuccessMessage(`${data.inscriptions.length} marchand(s) trouvé(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const predictInactiveMerchants = async () => {
    try {
      if (selectedMerchants.length === 0) {
        throw new Error('Veuillez sélectionner au moins un marchand');
      }
      
      setLoading(true);
      setError('');
      
      const response = await fetch(
        'http://localhost:5001/predict/inactive-merchants',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            marchands_ids: selectedMerchants
          })
        }
      );
      
      if (!response.ok) throw new Error('Erreur lors de la prédiction');
      
      const data = await response.json();
      setInactiveMerchants(data.inactive_merchants);
      setSuccessMessage(`${data.inactive_merchants.length} marchand(s) prédit(s) comme inactifs`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const toggleMerchantSelection = (id: number) => {
    setSelectedMerchants(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id) 
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedMerchants.length === filteredInscriptions.length) {
      setSelectedMerchants([]);
    } else {
      setSelectedMerchants(filteredInscriptions.map(i => i.id_marchand));
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            Analyse des Marchands
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-indigo-700">Bonjour, {user?.name}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
        
        {/* Formulaire de dates */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-8 mb-8 border border-purple-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-medium text-indigo-700 mb-2">
                <Calendar className="inline-block w-4 h-4 mr-2 text-indigo-500" />
                Date de début
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/50 transition duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-700 mb-2">
                <Calendar className="inline-block w-4 h-4 mr-2 text-indigo-500" />
                Date de fin
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/50 transition duration-200"
              />
            </div>
          </div>
          <div className="flex gap-4 mt-8">
            <button
              onClick={fetchInscriptions}
              disabled={loading || !startDate || !endDate}
              className="flex-1 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transform hover:scale-105 transition duration-200 flex items-center justify-center shadow-md relative"
            >
              {loading ? (
                <>
                  <div className="absolute left-0 top-0 bottom-0 bg-white/20 w-full origin-left animate-progress" style={{ animationDuration: '2s' }}></div>
                  <span className="relative z-10 flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Chargement...
                  </span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Rechercher les marchands
                </>
              )}
            </button>
            <button
              onClick={predictInactiveMerchants}
              disabled={loading || selectedMerchants.length === 0}
              className="flex-1 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transform hover:scale-105 transition duration-200 flex items-center justify-center shadow-md relative"
            >
              {loading ? (
                <>
                  <div className="absolute left-0 top-0 bottom-0 bg-white/20 w-full origin-left animate-progress" style={{ animationDuration: '2s' }}></div>
                  <span className="relative z-10 flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Prédiction en cours...
                  </span>
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 mr-2" />
                  Prédire inactivité ({selectedMerchants.length})
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8 rounded-r-lg">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <p className="ml-3 text-red-700">{error}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-8 rounded-r-lg">
            <div className="flex">
              <Check className="h-5 w-5 text-green-400" />
              <p className="ml-3 text-green-700">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Résultats */}
        <div className="grid grid-cols-1 gap-8">
          {/* Inscriptions */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-purple-100">
            <div className="px-6 py-4 border-b border-purple-100 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-indigo-900">Inscriptions récentes</h2>
              {inscriptions.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {selectedMerchants.length === filteredInscriptions.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              )}
            </div>
            <div className="p-6">
              {inscriptions.length > 0 ? (
                <div>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-indigo-400" />
                    <input
                      type="text"
                      placeholder="Rechercher par nom, téléphone ou ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-8 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {searchTerm && (
                      <button
                        onClick={clearSearch}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-indigo-400 hover:text-indigo-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[1000px]' : 'max-h-[500px]'}`}>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-purple-200">
                        <thead>
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">Sélection</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">ID Marchand</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">Raison Sociale</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">Date Inscription</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">Représentant</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-indigo-500 uppercase tracking-wider">Téléphone</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-purple-100">
                          {filteredInscriptions.map((inscription) => (
                            <tr 
                              key={inscription.id_marchand} 
                              className={`hover:bg-purple-50 transition duration-150 ${
                                selectedMerchants.includes(inscription.id_marchand) ? 'bg-purple-50' : ''
                              }`}
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={selectedMerchants.includes(inscription.id_marchand)}
                                  onChange={() => toggleMerchantSelection(inscription.id_marchand)}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-purple-300 rounded"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600">
                                {inscription.id_marchand}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-900">
                                {inscription.raison_sociale}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-900">
                                {inscription.type_marchand}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600">
                                {format(new Date(inscription.date_inscription), 'dd/MM/yyyy')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-900">
                                {inscription.nom_representant}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-900">
                                {inscription.tel_representant}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {filteredInscriptions.length > 5 && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-sm"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Voir moins
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Voir plus ({filteredInscriptions.length - 5} autres)
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-indigo-500 text-center py-8">Aucune inscription trouvée pour cette période</p>
              )}
            </div>
          </div>

          {inactiveMerchants.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-amber-100">
              <div className="px-6 py-4 border-b border-amber-100 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-amber-900">Résultats de prédiction</h2>
                  <div className="mt-1 text-amber-700">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      {inactiveMerchants.length} marchand(s) à risque
                    </span>
                  </div>
                </div>
                <div className="text-sm text-amber-600">
                  Risque moyen: {((inactiveMerchants.reduce((acc, curr) => acc + curr.risque, 0) / inactiveMerchants.length) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4"> {/* Ajout du conteneur grid */}
                {inactiveMerchants.map((merchant, index) => (
                  <div
                    key={index}
                    className="border border-amber-200 rounded-lg p-4 bg-amber-50 hover:shadow-md transition duration-200" // Suppression de md:col-span-1 ici
                  >
                    <h3 className="font-bold text-amber-800 mb-2">{merchant.raison_sociale}</h3>
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="font-medium">ID Marchand:</span> {merchant.id_marchand}
                      </p>
                      {merchant.derniere_transaction && (
                        <p className="text-sm" dangerouslySetInnerHTML={{ __html: merchant.derniere_transaction }} />
                      )}
                      <p className="text-sm">
                        <span className="font-medium">Transactions (30 jours):</span> {merchant.nombre_transactions_30_jours}
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium">Risque d'inactivité:</span>
                          <span className="font-bold">
                            {(merchant.risque * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-amber-200 rounded-full h-2.5">
                          <div
                            className="bg-amber-600 h-2.5 rounded-full"
                            style={{ width: `${merchant.risque * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}