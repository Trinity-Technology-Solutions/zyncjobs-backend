import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let citiesData = [];
let countriesData = [];

try {
  citiesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cities.json'), 'utf8')).cities || [];
  countriesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/countries.json'), 'utf8')).countries || [];
} catch (error) {
  console.error('Error loading location data:', error);
}

// City → Country mapping built from cities.json groupings
const cityCountryMap = {
  // India
  ...Object.fromEntries([
    'Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad','Surat','Jaipur',
    'Lucknow','Kanpur','Nagpur','Indore','Thane','Bhopal','Visakhapatnam','Pimpri-Chinchwad','Patna','Vadodara',
    'Ghaziabad','Ludhiana','Agra','Nashik','Faridabad','Meerut','Rajkot','Varanasi','Srinagar','Aurangabad',
    'Dhanbad','Amritsar','Navi Mumbai','Allahabad','Ranchi','Howrah','Coimbatore','Jabalpur','Gwalior',
    'Vijayawada','Jodhpur','Madurai','Raipur','Kota','Guwahati','Chandigarh','Solapur','Hubli-Dharwad',
    'Bareilly','Moradabad','Mysore','Gurgaon','Aligarh','Jalandhar','Tiruchirappalli','Bhubaneswar','Salem',
    'Warangal','Guntur','Bhiwandi','Saharanpur','Gorakhpur','Bikaner','Amravati','Jamshedpur','Bhilai',
    'Cuttack','Kochi','Nellore','Bhavnagar','Dehradun','Durgapur','Asansol','Rourkela','Nanded','Kolhapur',
    'Ajmer','Akola','Gulbarga','Jamnagar','Ujjain','Siliguri','Jhansi','Ulhasnagar','Jammu','Mangalore',
    'Erode','Belgaum','Tirunelveli','Malegaon','Gaya','Jalgaon','Udaipur','Davanagere','Kozhikode',
    'Kurnool','Rajahmundry','Bokaro','Bellary','Patiala','Agartala','Bhagalpur','Muzaffarnagar','Latur',
    'Dhule','Rohtak','Bhilwara','Berhampur','Muzaffarpur','Ahmednagar','Mathura','Kollam','Kadapa',
    'Sambalpur','Bilaspur','Shahjahanpur','Satara','Bijapur','Rampur','Shivamogga','Chandrapur','Junagadh',
    'Thrissur','Alwar','Kakinada','Nizamabad','Parbhani','Tumkur','Khammam','Panipat','Darbhanga',
    'Dewas','Ichalkaranji','Karnal','Bathinda','Jalna','Eluru','Purnia','Satna','Mau','Sonipat',
    'Farrukhabad','Sagar','Durg','Imphal','Ratlam','Hapur','Arrah','Anantapur','Karimnagar','Etawah',
    'Ambernath','Bharatpur','Begusarai','New Delhi','Gandhidham','Tiruvottiyur','Puducherry','Sikar',
    'Thoothukudi','Rewa','Mirzapur','Raichur','Pali','Ramagundam','Silchar','Orai','Tenali','Jorhat',
    'Karaikudi','Kishanganj','Surendranagar','Noida','Greater Noida'
  ].map(c => [c, 'India'])),
  // United States
  ...Object.fromEntries([
    'New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego',
    'Dallas','San Jose','Austin','Jacksonville','Fort Worth','Columbus','Charlotte','San Francisco',
    'Indianapolis','Seattle','Denver','Washington','Boston','El Paso','Nashville','Detroit',
    'Oklahoma City','Portland','Las Vegas','Memphis','Louisville','Baltimore','Milwaukee','Albuquerque',
    'Tucson','Fresno','Sacramento','Kansas City','Long Beach','Mesa','Atlanta','Colorado Springs',
    'Virginia Beach','Raleigh','Omaha','Miami','Oakland','Minneapolis','Tulsa','Wichita','New Orleans','Arlington'
  ].map(c => [c, 'United States'])),
  // United Kingdom
  ...Object.fromEntries([
    'London','Birmingham','Manchester','Glasgow','Liverpool','Leeds','Sheffield','Edinburgh','Bristol',
    'Leicester','Coventry','Bradford','Cardiff','Belfast','Nottingham','Kingston upon Hull',
    'Newcastle upon Tyne','Stoke-on-Trent','Southampton','Derby','Portsmouth','Brighton','Plymouth',
    'Northampton','Reading','Luton','Wolverhampton','Bolton','Bournemouth','Norwich','Slough',
    'Watford','Milton Keynes','Guildford','Woking'
  ].map(c => [c, 'United Kingdom'])),
  // Canada
  ...Object.fromEntries([
    'Toronto','Montreal','Vancouver','Calgary','Edmonton','Ottawa','Winnipeg','Quebec City','Hamilton',
    'Kitchener','Victoria','Halifax','Oshawa','Windsor','Saskatoon','St. Catharines','Regina',
    'Sherbrooke','Barrie','Mississauga','Brampton','Markham','Vaughan','Burnaby','Surrey','Richmond','Langley'
  ].map(c => [c, 'Canada'])),
  // Australia
  ...Object.fromEntries([
    'Sydney','Melbourne','Brisbane','Perth','Adelaide','Gold Coast','Newcastle','Canberra',
    'Sunshine Coast','Wollongong','Hobart','Geelong','Townsville','Cairns','Darwin','Toowoomba',
    'Ballarat','Bendigo','Albury','Launceston','Parramatta','Penrith','Blacktown','Chatswood'
  ].map(c => [c, 'Australia'])),
  // Japan
  ...Object.fromEntries([
    'Tokyo','Yokohama','Osaka','Nagoya','Sapporo','Fukuoka','Kobe','Kawasaki','Kyoto','Saitama',
    'Hiroshima','Sendai','Kitakyushu','Chiba','Sakai','Niigata','Hamamatsu','Okayama','Sagamihara','Kumamoto'
  ].map(c => [c, 'Japan'])),
  // UAE
  ...Object.fromEntries([
    'Dubai','Abu Dhabi','Sharjah','Ajman','Ras Al Khaimah','Fujairah','Al Ain',
    'Business Bay','DIFC','Jebel Ali','Dubai Internet City','Dubai Media City','Dubai Silicon Oasis'
  ].map(c => [c, 'United Arab Emirates'])),
  // Saudi Arabia
  ...Object.fromEntries([
    'Riyadh','Jeddah','Mecca','Medina','Dammam','Khobar','Tabuk','Buraidah','Khamis Mushait','Hofuf'
  ].map(c => [c, 'Saudi Arabia'])),
  // Qatar
  'Doha': 'Qatar',
  // Kuwait
  'Kuwait City': 'Kuwait',
  // Singapore
  ...Object.fromEntries(['Singapore','Jurong East','Tampines','Woodlands','Yishun','Punggol'].map(c => [c, 'Singapore'])),
  // France
  ...Object.fromEntries([
    'Paris','Marseille','Lyon','Toulouse','Nice','Nantes','Strasbourg','Montpellier','Bordeaux','Lille',
    'Rennes','Reims','Le Havre','Saint-Étienne','Toulon','Grenoble','Dijon','Angers','Nîmes','Villeurbanne'
  ].map(c => [c, 'France'])),
  // Germany
  ...Object.fromEntries([
    'Berlin','Hamburg','Munich','Cologne','Frankfurt','Stuttgart','Düsseldorf','Dortmund','Essen','Leipzig',
    'Bremen','Dresden','Hanover','Nuremberg','Duisburg','Bochum','Wuppertal','Bielefeld','Bonn','Münster'
  ].map(c => [c, 'Germany'])),
  // Ireland
  ...Object.fromEntries(['Dublin','Cork','Galway','Limerick'].map(c => [c, 'Ireland'])),
  // Netherlands
  ...Object.fromEntries(['Amsterdam','Rotterdam','Utrecht','Eindhoven','The Hague'].map(c => [c, 'Netherlands'])),
  // Spain
  ...Object.fromEntries(['Madrid','Barcelona','Valencia','Seville'].map(c => [c, 'Spain'])),
  // Italy
  ...Object.fromEntries(['Rome','Milan','Turin','Florence'].map(c => [c, 'Italy'])),
  // Malaysia
  ...Object.fromEntries(['Kuala Lumpur','Penang','Johor Bahru'].map(c => [c, 'Malaysia'])),
  // Thailand
  ...Object.fromEntries(['Bangkok','Chiang Mai','Phuket'].map(c => [c, 'Thailand'])),
  // Indonesia
  ...Object.fromEntries(['Jakarta','Bandung','Surabaya'].map(c => [c, 'Indonesia'])),
  // Philippines
  ...Object.fromEntries(['Manila','Quezon City','Cebu'].map(c => [c, 'Philippines'])),
  // Vietnam
  ...Object.fromEntries(['Ho Chi Minh City','Hanoi','Da Nang'].map(c => [c, 'Vietnam'])),
};

// GET /api/locations - Get all cities (legacy support)
router.get('/', (req, res) => {
  res.json({ countries: citiesData, locations: citiesData });
});

// GET /api/locations/countries - Get all countries
router.get('/countries', (req, res) => {
  res.json({ countries: countriesData });
});

// GET /api/locations/cities - Search cities
router.get('/cities', (req, res) => {
  try {
    const { q = '' } = req.query;
    const query = q.toLowerCase();
    const filtered = query
      ? citiesData.filter(c => c.toLowerCase().includes(query)).slice(0, 10)
      : citiesData.slice(0, 10);
    res.json({ cities: filtered });
  } catch (error) {
    res.json({ cities: [] });
  }
});

// GET /api/locations/city-country/:city - Get country for a city
router.get('/city-country/:city', (req, res) => {
  const city = req.params.city.trim();
  // Exact match first
  if (cityCountryMap[city]) return res.json({ country: cityCountryMap[city] });
  // Case-insensitive match
  const key = Object.keys(cityCountryMap).find(k => k.toLowerCase() === city.toLowerCase());
  if (key) return res.json({ country: cityCountryMap[key] });
  // Partial match
  const partial = Object.keys(cityCountryMap).find(k => k.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(k.toLowerCase()));
  if (partial) return res.json({ country: cityCountryMap[partial] });
  res.json({ country: null });
});

// GET /api/locations/search/:query - Search cities (legacy)
router.get('/search/:query', (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const filtered = citiesData.filter(c => c.toLowerCase().includes(query)).slice(0, 10);
    res.json({ locations: filtered });
  } catch (error) {
    res.json({ locations: [] });
  }
});

export default router;
