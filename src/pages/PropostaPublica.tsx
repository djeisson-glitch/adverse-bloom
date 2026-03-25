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

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approvedName, setApprovedName] = useState("");

  useEffect(() => {
    if (!token) return;
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

  const handleApprove = async () => {
    if (!name.trim() || !email.trim()) return;
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
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif" }}>Proposta não encontrada</h1>
          <p style={{ color: "rgba(240,235,227,0.65)" }}>{error}</p>
        </div>
      </div>
    );
  }

  const { proposal, budget, items } = data;
  const deliverables: Deliverable[] = proposal.deliverables || [];
  const tags: string[] = proposal.tags || [];
  const notIncluded: string[] = budget?.not_included || [];
  const isCompleta = proposal.template_type === "completa";

  // Group items by category for scope
  const scopeItems: { label: string; value: string }[] = [];
  const categories = [...new Set(items.map((i: any) => i.category))];
  categories.forEach((cat: string) => {
    const catItems = items.filter((i: any) => i.category === cat && i.client_price > 0);
    if (catItems.length > 0) {
      scopeItems.push({
        label: cat,
        value: catItems.map((i: any) => i.item_name).join("\n"),
      });
    }
  });

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600&family=Barlow+Condensed:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a !important; }
      `}</style>
      <div style={{
        background: "#0a0a0a",
        color: "#f0ebe3",
        fontFamily: "'Barlow', sans-serif",
        fontWeight: 400,
        lineHeight: 1.6,
        WebkitFontSmoothing: "antialiased",
        minHeight: "100vh",
      }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "60px 48px 80px" }}>
          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 40, borderBottom: "1px solid rgba(240,235,227,0.18)", marginBottom: 48 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 22, letterSpacing: "0.02em", color: "#f0ebe3", display: "flex", alignItems: "center", gap: 4 }}>
              adverse<span style={{ color: "#e8281e", fontWeight: 700 }}>/</span>rec
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)", marginBottom: 4 }}>
                Proposta Nº {budget?.budget_number || "—"}
              </div>
              <div style={{ fontSize: 13, color: "rgba(240,235,227,0.65)" }}>
                {formatDateBR(proposal.created_at)}
              </div>
            </div>
          </div>

          {/* DESTINATÁRIO */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 8 }}>Para</div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 500, fontSize: 26, letterSpacing: "0.01em", color: "#f0ebe3", marginBottom: 2 }}>
              {proposal.contact_name}
            </h2>
            <p style={{ fontSize: 13, fontWeight: 400, color: "rgba(240,235,227,0.65)" }}>
              {proposal.contact_company}
            </p>
          </div>

          {/* PROJETO */}
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 36, letterSpacing: "0.01em", lineHeight: 1.15, color: "#f0ebe3", marginBottom: 12 }}>
              {budget?.project_name}
            </h1>
            {tags.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tags.map((t, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 10px", border: "1px solid rgba(240,235,227,0.18)", color: "rgba(240,235,227,0.65)" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* DESCRICAO */}
          {proposal.project_description && (
            <div style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(240,235,227,0.82)", marginBottom: 48, maxWidth: 580 }}>
              {proposal.project_description}
            </div>
          )}

          {/* COMPLETA-ONLY: Apresentação section could go here in future */}

          {/* ESCOPO */}
          {scopeItems.length > 0 && (
            <>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 20 }}>
                Escopo de Produção
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "rgba(240,235,227,0.18)", marginBottom: 48 }}>
                {scopeItems.map((item, i) => (
                  <div key={i} style={{ background: "#0a0a0a", padding: "20px 24px" }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)", marginBottom: 6 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 14, color: "#f0ebe3", fontWeight: 500, lineHeight: 1.5, whiteSpace: "pre-line" }}>
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
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 20 }}>
                Entregas
              </div>
              {deliverables.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "16px 0", borderBottom: "1px solid rgba(240,235,227,0.18)", ...(i === 0 ? { borderTop: "1px solid rgba(240,235,227,0.18)" } : {}) }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#e8281e", marginTop: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "#f0ebe3", marginBottom: 2 }}>
                      {d.name}
                    </div>
                    {d.description && (
                      <div style={{ fontSize: 13, fontWeight: 400, color: "rgba(240,235,227,0.65)" }}>
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
            <div style={{ marginBottom: 48, padding: 24, background: "#1c1c1c" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 12 }}>
                Não inclui
              </div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {notIncluded.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, fontWeight: 400, color: "rgba(240,235,227,0.65)", paddingLeft: 16, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, color: "rgba(240,235,227,0.18)" }}>—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* INVESTIMENTO */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "40px 0", borderTop: "1px solid rgba(240,235,227,0.18)", borderBottom: "1px solid rgba(240,235,227,0.18)", marginBottom: 48 }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8281e", marginBottom: 8 }}>
                Investimento total
              </div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 52, letterSpacing: "-0.01em", color: "#f0ebe3", lineHeight: 1, marginBottom: 6 }}>
                {formatCurrencyBR(budget?.total_value || 0)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 400, color: "rgba(240,235,227,0.65)", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                {proposal.payment_conditions}
                {"\n"}Tributos inclusos
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "rgba(240,235,227,0.65)" }}>
                Validade: {proposal.validity_days} dias
              </div>
            </div>
          </div>

          {/* APROVAÇÃO */}
          <div style={{ background: "#1c1c1c", padding: 36 }}>
            {!approved ? (
              <>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 20, letterSpacing: "0.03em", color: "#f0ebe3", marginBottom: 6 }}>
                  Aprovar esta proposta
                </div>
                <div style={{ fontSize: 13, fontWeight: 400, color: "rgba(240,235,227,0.65)", marginBottom: 28, maxWidth: 460, lineHeight: 1.6 }}>
                  O aceite confirma o início do planejamento operacional conforme o escopo descrito acima. Retorno em até 24h após aprovação.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)" }}>Nome completo</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Seu nome"
                      style={{
                        background: "rgba(232,224,212,0.05)",
                        border: "1px solid rgba(240,235,227,0.18)",
                        color: "#f0ebe3",
                        fontFamily: "'Barlow', sans-serif",
                        fontSize: 14,
                        padding: "12px 14px",
                        outline: "none",
                        width: "100%",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,235,227,0.65)" }}>E-mail</label>
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      type="email"
                      style={{
                        background: "rgba(232,224,212,0.05)",
                        border: "1px solid rgba(240,235,227,0.18)",
                        color: "#f0ebe3",
                        fontFamily: "'Barlow', sans-serif",
                        fontSize: 14,
                        padding: "12px 14px",
                        outline: "none",
                        width: "100%",
                      }}
                    />
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
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    padding: "14px 28px",
                    cursor: approving ? "wait" : "pointer",
                    marginTop: 8,
                    opacity: (!name.trim() || !email.trim()) ? 0.5 : 1,
                  }}
                >
                  <span style={{ width: 16, height: 16, border: "2px solid #0a0a0a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ width: 6, height: 6, background: "#0a0a0a", borderRadius: "50%" }} />
                  </span>
                  {approving ? "Aprovando..." : "Aprovar proposta"}
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ width: 48, height: 48, border: "2px solid #e8281e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e8281e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: "0.02em", color: "#f0ebe3", marginBottom: 8 }}>
                  Proposta aprovada
                </h3>
                <p style={{ fontSize: 13, color: "rgba(240,235,227,0.65)", lineHeight: 1.6 }}>
                  Obrigado, {approvedName || proposal.approved_name}. Entraremos em contato em breve para iniciar o planejamento da produção.
                </p>
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div style={{ marginTop: 60, paddingTop: 32, borderTop: "1px solid rgba(240,235,227,0.18)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: 16, color: "rgba(240,235,227,0.4)", display: "flex", alignItems: "center", gap: 3 }}>
              adverse<span style={{ color: "#e8281e", opacity: 0.5 }}>/</span>rec
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "rgba(240,235,227,0.4)", lineHeight: 1.7 }}>
              comercial@adverse.rec.br<br />
              +55 (54) 99637-8692<br />
              Passo Fundo, RS
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
