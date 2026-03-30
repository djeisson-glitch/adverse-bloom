import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Deliverable {
  name: string;
  description: string;
}

interface ProposalData {
  proposal: any;
  budget: any;
  items: any[];
}

function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value).replace("R$", "R$");
}

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function isLogisticsCategory(cat: string): boolean {
  return (cat || "").trim().toUpperCase() === "LOGÍSTICA";
}

function isPostProductionCategory(cat: string): boolean {
  return (cat || "").trim().toUpperCase() === "PÓS-PRODUÇÃO";
}

/** Parse not_included which could be string[], object[], or JSON string */
function parseNotIncluded(raw: any): string[] {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item: any) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && item.text) return item.text;
      if (item && typeof item === "object" && item.name) return item.name;
      return String(item);
    })
    .filter((s: string) => s.trim().length > 0);
}

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const isPreview = token === "preview";
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approvedName, setApprovedName] = useState("");

  useEffect(() => {
    if (!token) return;

    if (isPreview) {
      // Load from sessionStorage for preview mode
      try {
        const raw = sessionStorage.getItem("proposal_preview");
        if (!raw) throw new Error("Dados de pré-visualização não encontrados");
        const preview = JSON.parse(raw);
        setData({
          proposal: {
            contact_name: preview.contactName,
            contact_company: preview.contactCompany,
            project_description: preview.projectDescription,
            tags: preview.tags || [],
            deliverables: preview.deliverables || [],
            payment_conditions: preview.paymentConditions,
            validity_days: preview.validityDays,
            created_at: new Date().toISOString(),
            status: "preview",
          },
          budget: preview.budget,
          items: preview.items || [],
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    (async () => {
      try {
        const { data: result, error: fnErr } = await supabase.functions.invoke("get-proposal", {
          body: { token },
        });
        if (fnErr) throw fnErr;
        if (result.error) throw new Error(result.error);
        setData(result);
        if (result.proposal.status === "approved") {
          setApproved(true);
          setApprovedName(result.proposal.approved_name || "");
        }
      } catch (err: any) {
        setError(err.message || "Proposta não encontrada");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const [emailError, setEmailError] = useState("");

  const validateEmail = (e: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(e);
  };

  const handleApprove = async () => {
    if (!name.trim() || !email.trim()) return;
    if (!validateEmail(email.trim())) {
      setEmailError("Por favor, insira um e-mail válido.");
      return;
    }
    setEmailError("");
    setApproving(true);
    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke("approve-proposal", {
        body: { token, name: name.trim(), email: email.trim() },
      });
      if (fnErr) throw fnErr;
      if (result.error) {
        if (result.already_approved) {
          setApproved(true);
          setApprovedName(name);
          return;
        }
        throw new Error(result.error);
      }
      setApproved(true);
      setApprovedName(name);
    } catch (err: any) {
      alert(err.message || "Erro ao aprovar");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#f0ebe3" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#f0ebe3", fontFamily: "'Barlow', sans-serif" }}>
        <div style={{ textAlign: "center", padding: "0 24px" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif" }}>Proposta não encontrada</h1>
          <p style={{ color: "rgba(240,235,227,0.65)" }}>{error}</p>
        </div>
      </div>
    );
  }

  const { proposal, budget, items } = data;
  const deliverables: Deliverable[] = proposal.deliverables || [];
  const tags: string[] = proposal.tags || [];
  const notIncluded = parseNotIncluded(budget?.not_included);

  // Build scope items: exclude LOGÍSTICA, and for PÓS-PRODUÇÃO only show is_deliverable items
  const scopeItems: { label: string; value: string }[] = [];
  const categories = [...new Set(items.map((i: any) => i.category))];
  categories.forEach((cat: string) => {
    if (isLogisticsCategory(cat)) return; // skip logistics entirely

    const catItems = items.filter((i: any) => i.category === cat && i.client_price > 0);

    if (catItems.length > 0) {
      scopeItems.push({
        label: cat,
        value: catItems.map((i: any) => i.item_name).join("\n"),
      });
    }
  });

  const inputStyle: React.CSSProperties = {
    background: "rgba(232,224,212,0.05)",
    border: "1px solid rgba(240,235,227,0.18)",
    color: "#f0ebe3",
    fontFamily: "'Barlow', sans-serif",
    fontSize: 15,
    padding: "14px 16px",
    outline: "none",
    width: "100%",
    borderRadius: 0,
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600&family=Barlow+Condensed:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a !important; }
        @media (max-width: 600px) {
          .proposta-scope-grid { grid-template-columns: 1fr !important; }
          .proposta-invest-row { flex-direction: column !important; align-items: flex-start !important; }
          .proposta-invest-row > div:last-child { text-align: left !important; }
          .proposta-approval-fields { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{
        background: "#0a0a0a",
        color: "#f0ebe3",
        fontFamily: "'Barlow', sans-serif",
        fontWeight: 400,
        lineHeight: 1.7,
        WebkitFontSmoothing: "antialiased",
        minHeight: "100vh",
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "clamp(32px, 6vw, 60px) clamp(20px, 5vw, 48px) clamp(48px, 8vw, 80px)" }}>
          {/* PREVIEW BANNER */}
          {isPreview && (
            <div style={{ background: "#e8281e", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 600, textAlign: "center", padding: "10px 16px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 24 }}>
              ⚠ Pré-visualização — esta proposta não foi salva
            </div>
          )}
          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 40, borderBottom: "1px solid rgba(240,235,227,0.18)", marginBottom: 48, flexWrap: "wrap", gap: 16 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "clamp(20px, 3vw, 22px)", letterSpacing: "0.02em", color: "#f0ebe3", display: "flex", alignItems: "center", gap: 4 }}>
              adverse<span style={{ color: "#e8281e", fontWeight: 700 }}>/</span>rec
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)", marginBottom: 4 }}>
                Proposta Nº {budget?.budget_number || "—"}
              </div>
              <div style={{ fontSize: 14, color: "rgba(240,235,227,0.65)" }}>
                {formatDateBR(proposal.created_at)}
              </div>
            </div>
          </div>

          {/* DESTINATÁRIO */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 8 }}>Para</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 500, fontSize: "clamp(22px, 4vw, 28px)", letterSpacing: "0.01em", color: "#f0ebe3", marginBottom: 2 }}>
              {proposal.contact_name}
            </h2>
            <p style={{ fontSize: 15, fontWeight: 400, color: "rgba(240,235,227,0.65)" }}>
              {proposal.contact_company}
            </p>
          </div>

          {/* PROJETO */}
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "clamp(28px, 5vw, 40px)", letterSpacing: "0.01em", lineHeight: 1.15, color: "#f0ebe3", marginBottom: 12 }}>
              {budget?.project_name}
            </h1>
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tags.map((t, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 12px", border: "1px solid rgba(240,235,227,0.18)", color: "rgba(240,235,227,0.65)" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* DESCRICAO */}
          {proposal.project_description && (
            <div style={{ fontSize: 16, lineHeight: 1.8, color: "rgba(240,235,227,0.82)", marginBottom: 48, maxWidth: 620 }}>
              {proposal.project_description}
            </div>
          )}

          {/* OBSERVAÇÃO */}
          {budget.internal_notes && (
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "rgba(240,235,227,0.65)", marginBottom: 48, maxWidth: 620, fontStyle: "italic", borderLeft: "2px solid #e8281e", paddingLeft: 16 }}>
              {budget.internal_notes}
            </div>
          )}

          {/* ESCOPO */}
          {scopeItems.length > 0 && (
            <>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 20 }}>
                Escopo de Produção
              </div>
              <div className="proposta-scope-grid" style={{
                display: "grid",
                gridTemplateColumns: scopeItems.length === 1 ? "1fr" : "repeat(2, 1fr)",
                gap: 1,
                background: "rgba(240,235,227,0.12)",
                marginBottom: 48,
              }}>
                {scopeItems.map((item, i) => (
                  <div key={i} style={{
                    background: "#0a0a0a",
                    padding: "22px 24px",
                    ...(scopeItems.length % 2 !== 0 && i === scopeItems.length - 1 ? { gridColumn: "1 / -1" } : {}),
                  }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)", marginBottom: 8 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 15, color: "#f0ebe3", fontWeight: 500, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ENTREGAS */}
          {deliverables.length > 0 && (
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 20 }}>
                Entregas
              </div>
              {deliverables.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "18px 0", borderBottom: "1px solid rgba(240,235,227,0.18)", ...(i === 0 ? { borderTop: "1px solid rgba(240,235,227,0.18)" } : {}) }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8281e", marginTop: 9, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "#f0ebe3", marginBottom: 3 }}>
                      {d.name}
                    </div>
                    {d.description && (
                      <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(240,235,227,0.65)" }}>
                        {d.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* NAO INCLUI */}
          {notIncluded.length > 0 && (
            <div style={{ marginBottom: 48, padding: "clamp(16px, 3vw, 28px)", background: "#1c1c1c" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 14 }}>
                Não inclui
              </div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {notIncluded.map((item, i) => (
                  <li key={i} style={{ fontSize: 14, fontWeight: 400, color: "rgba(240,235,227,0.65)", paddingLeft: 18, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, color: "rgba(240,235,227,0.18)" }}>—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* INVESTIMENTO */}
          <div className="proposta-invest-row" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            padding: "40px 0",
            borderTop: "1px solid rgba(240,235,227,0.18)",
            borderBottom: "1px solid rgba(240,235,227,0.18)",
            marginBottom: 48,
            flexWrap: "wrap",
            gap: 20,
          }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 8 }}>
                Investimento total
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "clamp(36px, 7vw, 56px)", letterSpacing: "-0.01em", color: "#f0ebe3", lineHeight: 1, marginBottom: 8 }}>
                {formatCurrencyBR(budget?.total_value || 0)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(240,235,227,0.65)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {proposal.payment_conditions}
                {"\n"}Tributos inclusos
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "rgba(240,235,227,0.65)" }}>
                Validade: {proposal.validity_days} dias
              </div>
            </div>
          </div>

          {/* APROVAÇÃO */}
          {isPreview ? (
            <div style={{ background: "#1c1c1c", padding: "clamp(24px, 4vw, 40px)", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "rgba(240,235,227,0.65)", fontStyle: "italic" }}>
                Seção de aprovação (visível apenas na proposta final)
              </p>
            </div>
          ) : (
          <div style={{ background: "#1c1c1c", padding: "clamp(24px, 4vw, 40px)" }}>
            {!approved ? (
              <>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: "clamp(18px, 3vw, 22px)", letterSpacing: "0.03em", color: "#f0ebe3", marginBottom: 8 }}>
                  Aprovar esta proposta
                </div>
                <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(240,235,227,0.65)", marginBottom: 28, maxWidth: 480, lineHeight: 1.7 }}>
                  O aceite confirma o início do planejamento operacional conforme o escopo descrito acima. Retorno em até 24h após aprovação.
                </div>
                <div className="proposta-approval-fields" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14, marginBottom: 18 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)" }}>Nome completo</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Seu nome"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)" }}>E-mail</label>
                    <input
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                      placeholder="seu@email.com"
                      type="email"
                      style={inputStyle}
                    />
                    {emailError && (
                      <span style={{ fontSize: 12, color: "#e8281e", marginTop: 4, display: "block" }}>{emailError}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleApprove}
                  disabled={approving || !name.trim() || !email.trim()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#f0ebe3",
                    color: "#0a0a0a",
                    border: "none",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase" as const,
                    padding: "16px 32px",
                    cursor: approving ? "wait" : "pointer",
                    marginTop: 8,
                    opacity: (!name.trim() || !email.trim()) ? 0.5 : 1,
                    width: "auto",
                  }}
                >
                  <span style={{ width: 16, height: 16, border: "2px solid #0a0a0a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ width: 6, height: 6, background: "#0a0a0a", borderRadius: "50%" }} />
                  </span>
                  {approving ? "Aprovando..." : "Aprovar proposta"}
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "36px 0" }}>
                <div style={{ width: 52, height: 52, border: "2px solid #e8281e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e8281e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(20px, 3vw, 24px)", fontWeight: 600, letterSpacing: "0.02em", color: "#f0ebe3", marginBottom: 8 }}>
                  Proposta aprovada
                </h3>
                <p style={{ fontSize: 14, color: "rgba(240,235,227,0.65)", lineHeight: 1.7 }}>
                  Obrigado, {approvedName || proposal.approved_name}. Entraremos em contato em breve para iniciar o planejamento da produção.
                </p>
              </div>
            )}
          </div>
          )}

          {/* FOOTER */}
          <div style={{ marginTop: 60, paddingTop: 32, borderTop: "1px solid rgba(240,235,227,0.18)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 18, color: "rgba(240,235,227,0.4)", display: "flex", alignItems: "center", gap: 3 }}>
              adverse<span style={{ color: "#e8281e", opacity: 0.5 }}>/</span>rec
            </div>
            <div style={{ textAlign: "right", fontSize: 13, color: "rgba(240,235,227,0.4)", lineHeight: 1.8 }}>
              djeisson@adverse.rec.br<br />
              +55 (54) 99637-8692<br />
              Passo Fundo, RS
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
