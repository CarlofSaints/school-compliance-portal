"use client";

import { useAuth, authFetch } from "@/lib/useAuth";
import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";

interface SpendSettings {
  capexBudget: number;
  capexYear: number;
  sourcesOfFunds: string[];
  supplierConnections: string[];
}

export default function SpendSettingsPage() {
  const { session, loading } = useAuth("manage_spend_settings");
  const [settings, setSettings] = useState<SpendSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Editable list state
  const [newSource, setNewSource] = useState("");
  const [newConnection, setNewConnection] = useState("");
  const [editingSource, setEditingSource] = useState<{
    index: number;
    value: string;
  } | null>(null);
  const [editingConnection, setEditingConnection] = useState<{
    index: number;
    value: string;
  } | null>(null);

  const fetchSettings = useCallback(async () => {
    const res = await authFetch("/api/settings/spend");
    if (res.ok) setSettings(await res.json());
  }, []);

  useEffect(() => {
    if (session) fetchSettings();
  }, [session, fetchSettings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const res = await authFetch("/api/settings/spend", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setToast({ message: "Settings saved", type: "success" });
    } else {
      setToast({ message: "Failed to save settings", type: "error" });
    }
    setSaving(false);
  };

  const addSource = () => {
    if (!newSource.trim() || !settings) return;
    setSettings({
      ...settings,
      sourcesOfFunds: [...settings.sourcesOfFunds, newSource.trim()],
    });
    setNewSource("");
  };

  const removeSource = (index: number) => {
    if (!settings) return;
    setSettings({
      ...settings,
      sourcesOfFunds: settings.sourcesOfFunds.filter((_, i) => i !== index),
    });
  };

  const saveEditSource = () => {
    if (!editingSource || !settings) return;
    const updated = [...settings.sourcesOfFunds];
    updated[editingSource.index] = editingSource.value;
    setSettings({ ...settings, sourcesOfFunds: updated });
    setEditingSource(null);
  };

  const addConnection = () => {
    if (!newConnection.trim() || !settings) return;
    setSettings({
      ...settings,
      supplierConnections: [
        ...settings.supplierConnections,
        newConnection.trim(),
      ],
    });
    setNewConnection("");
  };

  const removeConnection = (index: number) => {
    if (!settings) return;
    setSettings({
      ...settings,
      supplierConnections: settings.supplierConnections.filter(
        (_, i) => i !== index
      ),
    });
  };

  const saveEditConnection = () => {
    if (!editingConnection || !settings) return;
    const updated = [...settings.supplierConnections];
    updated[editingConnection.index] = editingConnection.value;
    setSettings({ ...settings, supplierConnections: updated });
    setEditingConnection(null);
  };

  if (loading || !settings) return <div className="p-6">Loading...</div>;

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Spend Settings</h1>
          <p className="text-gray-500 text-sm">
            Configure CAPEX budget, sources of funds, and supplier connections
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* CAPEX Budget */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-medium text-sm text-gray-500 mb-4">
            CAPEX BUDGET
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget Year
              </label>
              <select
                value={settings.capexYear}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    capexYear: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              >
                {Array.from({ length: 7 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total CAPEX Budget (ZAR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  R
                </span>
                <input
                  type="number"
                  value={settings.capexBudget}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      capexBudget: parseFloat(e.target.value) || 0,
                    })
                  }
                  min="0"
                  step="0.01"
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sources of Funds */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-medium text-sm text-gray-500 mb-4">
            SOURCES OF FUNDS
          </h3>
          <div className="space-y-2 mb-4">
            {settings.sourcesOfFunds.map((source, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
              >
                {editingSource?.index === i ? (
                  <>
                    <input
                      type="text"
                      value={editingSource.value}
                      onChange={(e) =>
                        setEditingSource({
                          ...editingSource,
                          value: e.target.value,
                        })
                      }
                      onKeyDown={(e) => e.key === "Enter" && saveEditSource()}
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                      autoFocus
                    />
                    <button
                      onClick={saveEditSource}
                      className="text-xs text-primary hover:text-primary-dark font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingSource(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700">
                      {source}
                    </span>
                    <button
                      onClick={() =>
                        setEditingSource({ index: i, value: source })
                      }
                      className="text-xs text-primary hover:text-primary-dark font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeSource(i)}
                      className="text-xs text-risk-high hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSource()}
              placeholder="Add new source of funds..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
            <button
              onClick={addSource}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* Supplier Connections */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-medium text-sm text-gray-500 mb-4">
            SUPPLIER CONNECTIONS
          </h3>
          <div className="space-y-2 mb-4">
            {settings.supplierConnections.map((conn, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
              >
                {editingConnection?.index === i ? (
                  <>
                    <input
                      type="text"
                      value={editingConnection.value}
                      onChange={(e) =>
                        setEditingConnection({
                          ...editingConnection,
                          value: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && saveEditConnection()
                      }
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                      autoFocus
                    />
                    <button
                      onClick={saveEditConnection}
                      className="text-xs text-primary hover:text-primary-dark font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingConnection(null)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700">
                      {conn}
                    </span>
                    <button
                      onClick={() =>
                        setEditingConnection({ index: i, value: conn })
                      }
                      className="text-xs text-primary hover:text-primary-dark font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeConnection(i)}
                      className="text-xs text-risk-high hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newConnection}
              onChange={(e) => setNewConnection(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addConnection()}
              placeholder="Add new supplier connection..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
            />
            <button
              onClick={addConnection}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
