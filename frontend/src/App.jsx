import React, { useState, useEffect } from 'react';
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

const API_URL = '/api';

// Dark theme colors
const colors = {
  background: '#1a1a1a',
  cardBackground: '#2d2d2d',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  primary: '#4CAF50',
  danger: '#f44336',
  border: '#404040',
  inputBackground: '#404040',
  chartGrid: '#404040',
  chartText: '#b3b3b3',
  // Reading status colors
  good: '#4CAF50',    // Green
  moderate: '#FFC107', // Yellow
  bad: '#FF9800',     // Orange
  poor: '#f44336'     // Red
};

// Reading thresholds
const thresholds = {
  temperature: {
    good: { min: 65, max: 75 },    // 65-75°F is comfortable
    moderate: { min: 60, max: 85 }, // 60-85°F is acceptable
    bad: { min: 55, max: 90 }      // 55-90°F is concerning
  },
  humidity: {
    good: { min: 30, max: 60 },    // 30-60% is ideal
    moderate: { min: 20, max: 70 }, // 20-70% is acceptable
    bad: { min: 15, max: 80 }      // 15-80% is concerning
  },
  voc: {
    good: { max: 100 },            // 0-100 is good
    moderate: { max: 200 },        // 101-200 is moderate
    bad: { max: 300 }             // 201-300 is concerning
  },
  pm: {
    good: { max: 12 },             // 0-12 µg/m³ is good
    moderate: { max: 35.4 },       // 12.1-35.4 µg/m³ is moderate
    bad: { max: 55.4 }            // 35.5-55.4 µg/m³ is concerning
  }
};

// Helper function to determine reading status color
const getReadingColor = (type, value) => {
  const threshold = thresholds[type];
  if (!threshold) return colors.text;

  if (type === 'temperature' || type === 'humidity') {
    if (value >= threshold.good.min && value <= threshold.good.max) return colors.good;
    if (value >= threshold.moderate.min && value <= threshold.moderate.max) return colors.moderate;
    if (value >= threshold.bad.min && value <= threshold.bad.max) return colors.bad;
    return colors.poor;
  } else {
    if (value <= threshold.good.max) return colors.good;
    if (value <= threshold.moderate.max) return colors.moderate;
    if (value <= threshold.bad.max) return colors.bad;
    return colors.poor;
  }
};

// Add SHA-256 hashing function
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [sensorData, setSensorData] = useState([]);
  const [dailyAverages, setDailyAverages] = useState([]);
  const [timeRange, setTimeRange] = useState(24);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Token verification effect
  useEffect(() => {
    const verifyStoredToken = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        // Try to fetch data to verify token
        const response = await fetch(`${API_URL}/data?hours=1`, {
          headers: {
            'Authorization': `Bearer ${storedToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          setToken(storedToken);
          setIsAuthenticated(true);
        } else {
          // Token is invalid, clear it
          localStorage.removeItem('token');
        }
      } catch (error) {
        console.error('Token verification error:', error);
        localStorage.removeItem('token');
      } finally {
        setIsLoading(false);
      }
    };

    verifyStoredToken();
  }, []);

  // Data fetching effect
  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      try {
        const response = await fetch(`${API_URL}/data?hours=${timeRange}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const data = await response.json();
        console.log('Received data:', data);
        setSensorData(data);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch data: ' + error.message);
      }
    };

    if (token) {
      fetchData();
      
      // Set up auto-refresh every 5 minutes (300000 ms)
      const intervalId = setInterval(fetchData, 300000);
      
      // Cleanup interval on component unmount
      return () => clearInterval(intervalId);
    }
  }, [token, timeRange]);

  useEffect(() => {
    const fetchDailyAverages = async () => {
      if (!token) {
        console.log('No token available for daily averages request');
        return;
      }
      
      console.log('Starting daily averages fetch...');
      try {
        const response = await fetch(`${API_URL}/daily-averages`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          mode: 'cors'
        });
        
        console.log('Daily averages response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Daily averages error response:', errorText);
          throw new Error(`Failed to fetch daily averages: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Received daily averages data:', data);
        setDailyAverages(data);
      } catch (error) {
        console.error('Error in fetchDailyAverages:', error);
        setError('Failed to fetch daily averages: ' + error.message);
      }
    };

    if (isAuthenticated && token) {
      console.log('Triggering daily averages fetch...');
      fetchDailyAverages();
    }
  }, [isAuthenticated, token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Hash the password before sending
      const hashedPassword = await sha256(password);
      console.log('Sending hashed password:', hashedPassword);
      
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: hashedPassword }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Invalid password');
      }

      const data = await response.json();
      const newToken = data.token;
      
      // Save token to localStorage
      localStorage.setItem('token', newToken);
      
      setToken(newToken);
      setIsAuthenticated(true);
      setPassword('');
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear token from localStorage
    localStorage.removeItem('token');
    setToken('');
    setIsAuthenticated(false);
  };

  // Sort data by timestamp
  const sortedData = [...sensorData].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  const createChartData = (label, data, color) => ({
    labels: sortedData.map(item => {
      const date = new Date(item.timestamp);
      return date.toLocaleTimeString();
    }),
    datasets: [
      {
        label: label,
        data: data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.1,
        fill: true,
      },
    ],
  });

  const temperatureData = createChartData(
    'Temperature (°F)',
    sortedData.map(item => item.temperature),
    'rgb(255, 99, 132)'
  );

  const humidityData = createChartData(
    'Humidity (%)',
    sortedData.map(item => item.humidity),
    'rgb(54, 162, 235)'
  );

  const vocData = createChartData(
    'VOC Index',
    sortedData.map(item => item.voc_index),
    'rgb(75, 192, 192)'
  );

  const pmData = {
    labels: sortedData.map(item => {
      const date = new Date(item.timestamp);
      return date.toLocaleTimeString();
    }),
    datasets: [
      {
        label: 'PM1.0',
        data: sortedData.map(item => item.pm1_0),
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.2)',
        tension: 0.1,
        fill: true,
      },
      {
        label: 'PM2.5',
        data: sortedData.map(item => item.pm2_5),
        borderColor: 'rgb(153, 102, 255)',
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        tension: 0.1,
        fill: true,
      },
      {
        label: 'PM10',
        data: sortedData.map(item => item.pm10),
        borderColor: 'rgb(201, 203, 207)',
        backgroundColor: 'rgba(201, 203, 207, 0.2)',
        tension: 0.1,
        fill: true,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw;
            return `${context.dataset.label}: ${value}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Value'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: colors.background,
        color: colors.text
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ 
        backgroundColor: colors.cardBackground,
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        maxWidth: '400px',
        margin: '0 auto'
      }}>
        <h1 style={{ marginBottom: '1.5rem', color: colors.text }}>Den AQ Dashboard</h1>
        {error && <div style={{ color: colors.danger, marginBottom: '1rem' }}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', color: colors.text }}>Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.inputBackground,
                color: colors.text
              }}
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: colors.primary,
              color: colors.text,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '100%',
      backgroundColor: colors.background,
      minHeight: '100vh',
      color: colors.text
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h1 style={{ color: colors.text }}>Den AQ Dashboard</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: colors.danger,
            color: colors.text,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
      <div style={{ 
        backgroundColor: colors.cardBackground,
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginBottom: '1rem', color: colors.text }}>Current Readings</h2>
        {sensorData.length > 0 ? (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <div>
              <h3 style={{ color: colors.textSecondary, marginBottom: '0.5rem' }}>Temperature</h3>
              <p style={{ 
                fontSize: '1.5rem', 
                color: getReadingColor('temperature', sensorData[sensorData.length - 1].temperature),
                fontWeight: 'bold'
              }}>
                {sensorData[sensorData.length - 1].temperature.toFixed(1)}°F
              </p>
            </div>
            <div>
              <h3 style={{ color: colors.textSecondary, marginBottom: '0.5rem' }}>Humidity</h3>
              <p style={{ 
                fontSize: '1.5rem', 
                color: getReadingColor('humidity', sensorData[sensorData.length - 1].humidity),
                fontWeight: 'bold'
              }}>
                {sensorData[sensorData.length - 1].humidity.toFixed(1)}%
              </p>
            </div>
            <div>
              <h3 style={{ color: colors.textSecondary, marginBottom: '0.5rem' }}>VOC Index</h3>
              <p style={{ 
                fontSize: '1.5rem', 
                color: getReadingColor('voc', sensorData[sensorData.length - 1].voc_index),
                fontWeight: 'bold'
              }}>
                {sensorData[sensorData.length - 1].voc_index.toFixed(1)}
              </p>
            </div>
            <div>
              <h3 style={{ color: colors.textSecondary, marginBottom: '0.5rem' }}>Average PM</h3>
              <p style={{ 
                fontSize: '1.5rem', 
                color: getReadingColor('pm', (sensorData[sensorData.length - 1].pm1_0 + 
                  sensorData[sensorData.length - 1].pm2_5 + 
                  sensorData[sensorData.length - 1].pm10_0) / 3),
                fontWeight: 'bold'
              }}>
                {(sensorData[sensorData.length - 1].pm1_0 + 
                  sensorData[sensorData.length - 1].pm2_5 + 
                  sensorData[sensorData.length - 1].pm10_0).toFixed(1)} µg/m³
              </p>
            </div>
          </div>
        ) : (
          <p style={{ color: colors.textSecondary }}>No data available for the selected time range.</p>
        )}
      </div>

      <div style={{ 
        backgroundColor: colors.cardBackground,
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        marginBottom: '2rem'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h2 style={{ color: colors.text }}>Historical Data</h2>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            style={{
              padding: '0.5rem',
              backgroundColor: colors.inputBackground,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            <option value="1">Last Hour</option>
            <option value="6">Last 6 Hours</option>
            <option value="12">Last 12 Hours</option>
            <option value="24">Last 24 Hours</option>
            <option value="48">Last 48 Hours</option>
            <option value="72">Last 72 Hours</option>
          </select>
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem'
        }}>
          {/* Real-time graphs with dark theme */}
          <div style={{ 
            background: colors.cardBackground, 
            padding: '1rem', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>Temperature</h3>
            <div style={{ height: '200px' }}>
              <Line
                data={{
                  labels: sensorData.map(d => new Date(d.timestamp).toLocaleTimeString()),
                  datasets: [{
                    label: 'Temperature (°C)',
                    data: sensorData.map(d => d.temperature),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    fill: true,
                    tension: 0.4
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => `Temperature: ${context.raw.toFixed(1)}°C`
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: false,
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      },
                      title: {
                        display: true,
                        text: 'Temperature (°C)',
                        color: colors.chartText
                      }
                    },
                    x: {
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Repeat similar styling for other graphs */}
          <div style={{ 
            background: colors.cardBackground, 
            padding: '1rem', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>Humidity</h3>
            <div style={{ height: '200px' }}>
              <Line
                data={{
                  labels: sensorData.map(d => new Date(d.timestamp).toLocaleTimeString()),
                  datasets: [{
                    label: 'Humidity (%)',
                    data: sensorData.map(d => d.humidity),
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => `Humidity: ${context.raw.toFixed(1)}%`
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: false,
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      },
                      title: {
                        display: true,
                        text: 'Humidity (%)',
                        color: colors.chartText
                      }
                    },
                    x: {
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          <div style={{ 
            background: colors.cardBackground, 
            padding: '1rem', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>VOC Index</h3>
            <div style={{ height: '200px' }}>
              <Line
                data={{
                  labels: sensorData.map(d => new Date(d.timestamp).toLocaleTimeString()),
                  datasets: [{
                    label: 'VOC Index',
                    data: sensorData.map(d => d.voc_index),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    fill: true,
                    tension: 0.4
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => `VOC Index: ${context.raw.toFixed(1)}`
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: false,
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      },
                      title: {
                        display: true,
                        text: 'VOC Index',
                        color: colors.chartText
                      }
                    },
                    x: {
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          <div style={{ 
            background: colors.cardBackground, 
            padding: '1rem', 
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>Particulate Matter</h3>
            <div style={{ height: '200px' }}>
              <Line
                data={{
                  labels: sensorData.map(d => new Date(d.timestamp).toLocaleTimeString()),
                  datasets: [
                    {
                      label: 'PM1.0',
                      data: sensorData.map(d => d.pm1_0),
                      borderColor: 'rgb(255, 159, 64)',
                      backgroundColor: 'rgba(255, 159, 64, 0.1)',
                      fill: true,
                      tension: 0.4
                    },
                    {
                      label: 'PM2.5',
                      data: sensorData.map(d => d.pm2_5),
                      borderColor: 'rgb(153, 102, 255)',
                      backgroundColor: 'rgba(153, 102, 255, 0.1)',
                      fill: true,
                      tension: 0.4
                    },
                    {
                      label: 'PM10',
                      data: sensorData.map(d => d.pm10_0),
                      borderColor: 'rgb(201, 203, 207)',
                      backgroundColor: 'rgba(201, 203, 207, 0.1)',
                      fill: true,
                      tension: 0.4
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    tooltip: {
                      callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.raw.toFixed(1)} µg/m³`
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: false,
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      },
                      title: {
                        display: true,
                        text: 'Concentration (µg/m³)',
                        color: colors.chartText
                      }
                    },
                    x: {
                      grid: {
                        color: colors.chartGrid
                      },
                      ticks: {
                        color: colors.chartText
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', color: colors.text }}>Daily Averages (Last Two Weeks)</h2>
        {error && <div style={{ color: colors.danger, marginBottom: '1rem' }}>{error}</div>}
        {dailyAverages.length === 0 ? (
          <div style={{ color: colors.textSecondary }}>Loading daily averages...</div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {/* Daily average graphs with dark theme */}
            <div style={{ 
              background: colors.cardBackground, 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>Temperature Trend</h3>
              <div style={{ height: '200px' }}>
                <Line
                  data={{
                    labels: dailyAverages.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [{
                      label: 'Average Temperature (°C)',
                      data: dailyAverages.map(d => d.avg_temperature),
                      borderColor: 'rgb(255, 99, 132)',
                      backgroundColor: 'rgba(255, 99, 132, 0.1)',
                      fill: true,
                      tension: 0.4
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => `Temperature: ${context.raw.toFixed(1)}°C`
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: false,
                        grid: {
                          color: colors.chartGrid
                        },
                        ticks: {
                          color: colors.chartText
                        },
                        title: {
                          display: true,
                          text: 'Temperature (°C)',
                          color: colors.chartText
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ 
              background: colors.cardBackground, 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>Humidity Trend</h3>
              <div style={{ height: '200px' }}>
                <Line
                  data={{
                    labels: dailyAverages.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [{
                      label: 'Average Humidity (%)',
                      data: dailyAverages.map(d => d.avg_humidity),
                      borderColor: 'rgb(54, 162, 235)',
                      backgroundColor: 'rgba(54, 162, 235, 0.1)',
                      fill: true,
                      tension: 0.4
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => `Humidity: ${context.raw.toFixed(1)}%`
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: false,
                        grid: {
                          color: colors.chartGrid
                        },
                        ticks: {
                          color: colors.chartText
                        },
                        title: {
                          display: true,
                          text: 'Humidity (%)',
                          color: colors.chartText
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ 
              background: colors.cardBackground, 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>VOC Index Trend</h3>
              <div style={{ height: '200px' }}>
                <Line
                  data={{
                    labels: dailyAverages.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [{
                      label: 'Average VOC Index',
                      data: dailyAverages.map(d => d.avg_voc_index),
                      borderColor: 'rgb(75, 192, 192)',
                      backgroundColor: 'rgba(75, 192, 192, 0.1)',
                      fill: true,
                      tension: 0.4
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => `VOC Index: ${context.raw.toFixed(1)}`
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: false,
                        grid: {
                          color: colors.chartGrid
                        },
                        ticks: {
                          color: colors.chartText
                        },
                        title: {
                          display: true,
                          text: 'VOC Index',
                          color: colors.chartText
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ 
              background: colors.cardBackground, 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: colors.text }}>Particulate Matter Trend</h3>
              <div style={{ height: '200px' }}>
                <Line
                  data={{
                    labels: dailyAverages.map(d => new Date(d.date).toLocaleDateString()),
                    datasets: [
                      {
                        label: 'PM1.0',
                        data: dailyAverages.map(d => d.avg_pm1_0),
                        borderColor: 'rgb(255, 159, 64)',
                        backgroundColor: 'rgba(255, 159, 64, 0.1)',
                        fill: true,
                        tension: 0.4
                      },
                      {
                        label: 'PM2.5',
                        data: dailyAverages.map(d => d.avg_pm2_5),
                        borderColor: 'rgb(153, 102, 255)',
                        backgroundColor: 'rgba(153, 102, 255, 0.1)',
                        fill: true,
                        tension: 0.4
                      },
                      {
                        label: 'PM10',
                        data: dailyAverages.map(d => d.avg_pm10),
                        borderColor: 'rgb(201, 203, 207)',
                        backgroundColor: 'rgba(201, 203, 207, 0.1)',
                        fill: true,
                        tension: 0.4
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: (context) => `${context.dataset.label}: ${context.raw.toFixed(1)} µg/m³`
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: false,
                        grid: {
                          color: colors.chartGrid
                        },
                        ticks: {
                          color: colors.chartText
                        },
                        title: {
                          display: true,
                          text: 'Concentration (µg/m³)',
                          color: colors.chartText
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 
