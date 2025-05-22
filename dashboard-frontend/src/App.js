import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// EPA Air Quality Standards
const EPA_STANDARDS = {
  PM1_0: {
    GOOD: { max: 10, color: '#00e400' },
    MODERATE: { max: 25, color: '#ffff00' },
    HIGH: { max: 50, color: '#ff7e00' },
    VERY_HIGH: { max: Infinity, color: '#ff0000' }
  },
  PM2_5: {
    GOOD: { max: 9, color: '#00e400' },
    MODERATE: { max: 35.4, color: '#ffff00' },
    UNHEALTHY_SENSITIVE: { max: 55.4, color: '#ff7e00' },
    UNHEALTHY: { max: 125.4, color: '#ff0000' },
    VERY_UNHEALTHY: { max: 225.4, color: '#99004c' },
    HAZARDOUS: { max: Infinity, color: '#7e0023' }
  },
  PM10: {
    GOOD: { max: 54, color: '#00e400' },
    MODERATE: { max: 154, color: '#ffff00' },
    UNHEALTHY_SENSITIVE: { max: 254, color: '#ff7e00' },
    UNHEALTHY: { max: 354, color: '#ff0000' },
    VERY_UNHEALTHY: { max: 424, color: '#99004c' },
    HAZARDOUS: { max: Infinity, color: '#7e0023' }
  }
};

// Get color based on value and type
function getColorForValue(value, type) {
  const standards = EPA_STANDARDS[type];
  for (const [category, { max, color }] of Object.entries(standards)) {
    if (value <= max) return color;
  }
  return standards.HAZARDOUS.color;
}

// Get category based on value and type
function getCategoryForValue(value, type) {
  const standards = EPA_STANDARDS[type];
  for (const [category, { max }] of Object.entries(standards)) {
    if (value <= max) return category.replace(/_/g, ' ');
  }
  return 'HAZARDOUS';
}

// Format timestamp to readable date
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Common chart options with dark mode
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#fff'
      }
    },
    tooltip: {
      callbacks: {
        title: (items) => {
          return formatDate(items[0].label);
        }
      }
    }
  },
  scales: {
    x: {
      ticks: {
        maxRotation: 45,
        minRotation: 45,
        color: '#fff',
        callback: function(value, index) {
          return index % 3 === 0 ? formatDate(this.getLabelForValue(value)) : '';
        }
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.1)'
      }
    },
    y: {
      ticks: {
        color: '#fff'
      },
      grid: {
        color: 'rgba(255, 255, 255, 0.1)'
      }
    }
  }
};

function groupPMData(data) {
  const latestData = data[data.length - 1];
  const pm1_0Color = getColorForValue(latestData.pm1_0, 'PM1_0');
  const pm2_5Color = getColorForValue(latestData.pm2_5, 'PM2_5');
  const pm10Color = getColorForValue(latestData.pm10, 'PM10');

  return {
    labels: data.map(d => d.timestamp),
    datasets: [
      {
        label: 'PM1.0',
        data: data.map(d => d.pm1_0),
        borderColor: pm1_0Color,
        fill: false,
      },
      {
        label: 'PM2.5',
        data: data.map(d => d.pm2_5),
        borderColor: pm2_5Color,
        fill: false,
      },
      {
        label: 'PM10',
        data: data.map(d => d.pm10),
        borderColor: pm10Color,
        fill: false,
      },
    ],
  };
}

function makeLineData(data, key, label, color) {
  return {
    labels: data.map(d => d.timestamp),
    datasets: [
      {
        label,
        data: data.map(d => d[key]),
        borderColor: color,
        fill: false,
      },
    ],
  };
}

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('http://localhost:5000/api/login', { password });
      const { token, expires_in } = response.data;
      
      // Store token and expiration
      localStorage.setItem('token', token);
      localStorage.setItem('tokenExpiry', Date.now() + expires_in * 1000);
      
      onLogin(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#1a1a1a',
      color: '#fff'
    }}>
      <div style={{
        padding: '2rem',
        backgroundColor: '#2a2a2a',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{ margin: '0 0 1rem 0', textAlign: 'center' }}>Den Status Dashboard</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem' }}>Admin Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#333',
                border: '1px solid #444',
                borderRadius: '4px',
                color: '#fff'
              }}
            />
          </div>
          {error && <div style={{ color: '#ff6b6b' }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem',
              backgroundColor: loading ? '#666' : '#4ecdc4',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ sensorData, loading, error, timeframe, setTimeframe, fetchData, onLogout }) {
  const latestData = sensorData[sensorData.length - 1];
  const vocColor = latestData ? `rgb(${Math.min(255, (latestData.voc_index / 500) * 255)}, ${Math.max(0, 255 - (latestData.voc_index / 500) * 255)}, 0)` : '#00ff00';
  const pm1_0Category = latestData ? getCategoryForValue(latestData.pm1_0, 'PM1_0') : 'N/A';
  const pm2_5Category = latestData ? getCategoryForValue(latestData.pm2_5, 'PM2_5') : 'N/A';
  const pm10Category = latestData ? getCategoryForValue(latestData.pm10, 'PM10') : 'N/A';

  if (loading) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '20px',
        color: '#fff',
        backgroundColor: '#1a1a1a',
        minHeight: '100vh'
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        color: '#ff6b6b', 
        textAlign: 'center', 
        padding: '20px',
        backgroundColor: '#1a1a1a',
        minHeight: '100vh'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%',
      margin: '0 auto',
      padding: '20px',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      backgroundColor: '#1a1a1a',
      color: '#fff',
      boxSizing: 'border-box'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0 }}>Den Status Dashboard 🏠</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {[1, 6, 12, 24, 48].map(hours => (
            <button
              key={hours}
              onClick={() => setTimeframe(hours)}
              style={{
                padding: '8px 16px',
                backgroundColor: timeframe === hours ? '#4ecdc4' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {hours}h
            </button>
          ))}
          <button
            onClick={onLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ff6b6b',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginLeft: '10px'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {latestData && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '20px',
          padding: '20px',
          backgroundColor: '#2a2a2a',
          borderRadius: '8px'
        }}>
          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>VOC Index</h3>
            <div style={{ 
              fontSize: '24px',
              color: vocColor
            }}>
              {latestData.voc_index.toFixed(1)}
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>PM1.0</h3>
            <div style={{ 
              fontSize: '24px',
              color: getColorForValue(latestData.pm1_0, 'PM1_0')
            }}>
              {latestData.pm1_0.toFixed(1)} μg/m³
              <div style={{ fontSize: '14px', marginTop: '5px' }}>
                {pm1_0Category}
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>PM2.5</h3>
            <div style={{ 
              fontSize: '24px',
              color: getColorForValue(latestData.pm2_5, 'PM2_5')
            }}>
              {latestData.pm2_5.toFixed(1)} μg/m³
              <div style={{ fontSize: '14px', marginTop: '5px' }}>
                {pm2_5Category}
              </div>
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0' }}>PM10</h3>
            <div style={{ 
              fontSize: '24px',
              color: getColorForValue(latestData.pm10, 'PM10')
            }}>
              {latestData.pm10.toFixed(1)} μg/m³
              <div style={{ fontSize: '14px', marginTop: '5px' }}>
                {pm10Category}
              </div>
            </div>
          </div>
        </div>
      )}

      {sensorData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>No data available</div>
      ) : (
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          flex: 1,
          overflow: 'auto'
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '20px'
          }}>
            <div style={{ height: '300px' }}>
              <h2 style={{ margin: '0 0 10px 0' }}>Temperature (°F)</h2>
              <Line data={makeLineData(sensorData, 'temperature', 'Temperature', '#ffd93d')} options={chartOptions} />
            </div>
            <div style={{ height: '300px' }}>
              <h2 style={{ margin: '0 0 10px 0' }}>Humidity (%)</h2>
              <Line data={makeLineData(sensorData, 'humidity', 'Humidity', '#4ecdc4')} options={chartOptions} />
            </div>
          </div>
          <div style={{ height: '300px' }}>
            <h2 style={{ margin: '0 0 10px 0' }}>VOC Index</h2>
            <Line data={makeLineData(sensorData, 'voc_index', 'VOC Index', vocColor)} options={chartOptions} />
          </div>
          <div style={{ height: '300px' }}>
            <h2 style={{ margin: '0 0 10px 0' }}>PM Readings</h2>
            <Line data={groupPMData(sensorData)} options={chartOptions} />
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [sensorData, setSensorData] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState(24);
  const [isAdmin, setIsAdmin] = useState(() => {
    const token = localStorage.getItem('token');
    const expiry = localStorage.getItem('tokenExpiry');
    return token && expiry && Date.now() < parseInt(expiry);
  });

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    
    try {
      const token = localStorage.getItem('token');
      const expiry = localStorage.getItem('tokenExpiry');
      
      // Check if token is expired before making the request
      if (Date.now() >= parseInt(expiry)) {
        console.log('Token expired, logging out...');
        handleLogout();
        return;
      }
      
      const response = await axios.get(`http://localhost:5000/api/data?hours=${timeframe}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setSensorData(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      if (err.response?.status === 401) {
        console.log('Unauthorized, logging out...');
        handleLogout();
      } else {
        setError('Failed to fetch data. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, timeframe]);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      // Set up auto-refresh every 3 minutes
      const interval = setInterval(fetchData, 3 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, fetchData]);

  const handleLogout = () => {
    console.log('Logging out...');
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiry');
    setIsAdmin(false);
    setSensorData([]);
    setError(null);
  };

  if (!isAdmin) {
    return <LoginPage onLogin={setIsAdmin} />;
  }

  return (
    <>
      <button
        onClick={handleLogout}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '8px 16px',
          backgroundColor: '#ff6b6b',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 1000
        }}
      >
        Logout
      </button>
      <Dashboard
        sensorData={sensorData}
        loading={loading}
        error={error}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        fetchData={fetchData}
        onLogout={handleLogout}
      />
    </>
  );
}

export default App;
