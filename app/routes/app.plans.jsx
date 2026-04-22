import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useNavigation, Form, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  SkeletonPage,
  SkeletonDisplayText,
  SkeletonBodyText,
  Icon,
} from "@shopify/polaris";
import {
  ChevronLeftIcon,
  StarIcon,
  MagicIcon,
} from "@shopify/polaris-icons";

// ─────────────────────────────────────────────────────────────────────────────
// FAQ ITEM COMPONENT (Accordion)
// ─────────────────────────────────────────────────────────────────────────────
const FAQItem = ({ question, answer, isLast }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div 
      onClick={() => setIsOpen(!isOpen)}
      style={{ 
        padding: "24px 0", 
        borderBottom: isLast ? "none" : "1px solid #f1f5f9",
        cursor: "pointer"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="bodyLg" fontWeight="bold">{question}</Text>
        <div style={{ 
          width: "32px", height: "32px", borderRadius: "50%", background: "#f8fafc",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.3s ease",
          transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
          border: "1px solid #f1f5f9",
          flexShrink: 0
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      </div>
      <div style={{ 
        maxHeight: isOpen ? "300px" : "0", 
        overflow: "hidden", 
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        marginTop: isOpen ? "16px" : "0",
        opacity: isOpen ? 1 : 0
      }}>
        <Text variant="bodyMd" tone="subdued">{answer}</Text>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADER - Check current subscription status
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  try {
    const billingCheck = await billing.check({
      plans: ["Pro Monthly", "Pro Yearly"],
      isTest: true,
    });
    
    const activeSub = billingCheck.hasActivePayment 
      ? billingCheck.appSubscriptions.find(s => s.status === "ACTIVE")
      : null;

    return {
      subscription: activeSub,
      apiKey: process.env.SHOPIFY_API_KEY,
    };
  } catch (e) {
    return { subscription: null, apiKey: process.env.SHOPIFY_API_KEY };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION - Create subscription via GraphQL directly (most reliable method)
// ─────────────────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const planName = formData.get("planName");

  // Plan Details (matches shopify.server.js)
  const PLAN_DATA = {
    "Pro Monthly":  { amount: 9,   interval: "EVERY_30_DAYS", trial: 3 },
    "Pro Yearly":   { amount: 84,  interval: "ANNUAL",        trial: 3 },
  };

  if (planName === "Starter") {
    const billingCheck = await billing.check({
      plans: ["Pro Monthly", "Pro Yearly"],
      isTest: true,
    });
    if (billingCheck.hasActivePayment) {
      await billing.cancel({
        subscriptionId: billingCheck.appSubscriptions[0].id,
        isTest: true,
        prorate: true,
      });
    }
    return { success: true };
  }

  const plan = PLAN_DATA[planName];
  if (!plan) return { error: "Plan not found" };

  // Determine API Key carefully
  const apiKey = process.env.SHOPIFY_API_KEY || "27bee79bfa6071d88605e515871d4a7d";
  const returnUrl = `https://${session.shop}/admin/apps/${apiKey}/app/plans`;

  const response = await admin.graphql(
    `mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean!, $trialDays: Int) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      variables: {
        name: planName,
        test: true,
        returnUrl: returnUrl,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: plan.amount, currencyCode: "USD" },
                interval: plan.interval,
              },
            },
          },
        ],
        ...(plan.trial ? { trialDays: plan.trial } : {})
      },
    }
  );

  const responseJson = await response.json();
  const data = responseJson.data?.appSubscriptionCreate;

  if (data?.userErrors?.length > 0) {
    return { error: data.userErrors[0].message };
  }

  return { confirmationUrl: data.confirmationUrl };
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Plans() {
  const { subscription } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const isPageLoading = navigation.state === "loading" || (fetcher.state === "submitting" && fetcher.formData?.get("planName"));

  // Redirect logic
  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      window.top.location.href = fetcher.data.confirmationUrl;
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    } else if (fetcher.data?.success) {
      shopify.toast.show("Plan updated successfully");
    }
  }, [fetcher.data, shopify]);

  // ── SKELETON LOADER (Home Page Style) ──
  if (!isHydrated) {
    return (
      <div style={{ padding: "32px", maxWidth: "1300px", margin: "0 auto", opacity: 0 }}>
        <SkeletonPage title="Plans & Pricing" />
      </div>
    );
  }

  if (isPageLoading) {
    return (
      <div className="premium-dashboard page-fade-in">
        <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
          <SkeletonPage title="Plans & Pricing" primaryAction>
            <Layout>
              <Layout.Section>
                <Card>
                  <div style={{ padding: "40px" }}>
                    <SkeletonDisplayText size="medium" />
                    <div style={{ marginTop: "24px" }}><SkeletonBodyText lines={3} /></div>
                  </div>
                </Card>
                <div style={{ marginTop: "32px" }}>
                  <Card>
                    <div style={{ padding: "40px" }}>
                      <SkeletonDisplayText size="small" />
                      <div style={{ marginTop: "24px" }}><SkeletonBodyText lines={5} /></div>
                    </div>
                  </Card>
                </div>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <div style={{ padding: "40px" }}>
                    <BlockStack gap="500">
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={10} />
                    </BlockStack>
                  </div>
                </Card>
              </Layout.Section>
            </Layout>
          </SkeletonPage>
        </div>
      </div>
    );
  }

  const currentPlanName = subscription?.name || "Starter";

  const plans = [
    {
      name: "Starter", badge: "STARTER", tone: "new",
      description: "Essential tools for social proof.",
      priceMonthly: 0, priceYearly: 0, 
      features: [
        "Up to 12 Latest Posts",
        "Up to 4 Posts per Row",
        "Post Metrics on Hover",
        "Responsive Grid Layout",
        "Standard Support"
      ],
      isCurrent: currentPlanName === "Starter",
    },
    {
      name: "Pro", badge: "PRO", tone: "info",
      description: "Advanced controls with 3-Day Free Trial.",
      priceMonthly: 9, priceYearly: 7, 
      isPopular: true,
      features: [
        "Everything in Starter+",
        "Remove 'Ai-Instafeed' Watermark",
        "Infinite Scrolling Feature",
        "Manual Hide Mode (Hide Posts)",
        "Premium Story Layouts",
        "Unlimited Posts & Columns",
        "Priority 24/7 Support"
      ],
      isCurrent: currentPlanName.includes("Pro"),
      monthlyName: "Pro Monthly", yearlyName: "Pro Yearly",
    },
  ];

  const handlePlan = (plan) => {
    if (plan.isCurrent) return;
    const name = plan.name === "Starter" ? "Starter" : (isYearly ? plan.yearlyName : plan.monthlyName);
    const fd = new FormData();
    fd.append("planName", name);
    fetcher.submit(fd, { method: "POST" });
  };

  const isSubmitting = fetcher.state !== "idle" || navigation.state !== "idle";

  return (
    <div className="premium-dashboard page-fade-in">
      <style>{`
        .page-fade-in { animation: fadeInBlur 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        .button-success { 
          background: #10b981 !important; 
          color: white !important; 
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;
        }
      `}</style>
      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "0 16px" }}>
        <BlockStack gap="300">
          
          {/* --- PREMIUM BANNER (ABSOLUTE TOP) --- */}
          <div className="premium-card" style={{
            background: "var(--premium-accent-gradient)",
            padding: "24px 32px",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0px",
            border: "none",
            borderRadius: "20px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "50%", background: "rgba(255, 255, 255, 0.2)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <Icon source={StarIcon} tone="inherit" />
              </div>
              <BlockStack gap="100">
                <Text variant="headingLg" as="h2" color="inherit">Supercharge Your Social Proof</Text>
                <Text variant="bodyMd" as="p" tone="inherit">Join 10,000+ merchants using Ai-Instafeed to boost credibility and sales.</Text>
              </BlockStack>
            </div>
            <div style={{ 
              background: "rgba(255,255,255,0.1)", padding: "12px 20px", borderRadius: "12px", 
              border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(4px)",
              textAlign: "center"
            }}>
              <Text variant="headingMd" as="span" color="inherit">Trial Active</Text>
              <div style={{ fontSize: "11px", opacity: 0.8 }}>Start for $0 today</div>
            </div>
          </div>

          {/* --- PREMIUM HEADER --- */}
          <div className="premium-header" style={{ 
            marginBottom: "24px", display: "flex", justifyContent: "space-between", 
            alignItems: "center", padding: "16px 28px", gap: "16px"
          }}>
            <div className="brand-section">
              <button 
                onClick={() => navigate("/app")}
                style={{ 
                  background: "transparent", border: "none", cursor: "pointer", 
                  display: "flex", alignItems: "center", gap: "16px", padding: 0,
                  color: "white"
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", background: "white",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)", transition: "transform 0.2s"
                }} className="back-button-hover">
                  <Icon source={ChevronLeftIcon} tone="base" />
                </div>
                <div style={{ textAlign: "left" }}>
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "white", letterSpacing: "-0.5px" }}>Plans & Pricing</h1>
                  <p style={{ margin: 0, fontSize: "12px", color: "rgba(255, 255, 255, 0.85)", fontWeight: "500" }}>Back to Dashboard</p>
                </div>
              </button>
            </div>

            {/* --- INTEGRATED PRICING TOGGLE --- */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, justifyContent: "flex-end" }}>
              <div 
                onClick={() => setIsYearly(!isYearly)}
                style={{ 
                  background: "#f1f5f9", 
                  padding: "3px", 
                  borderRadius: "24px", 
                  display: "flex", 
                  alignItems: "center", 
                  cursor: "pointer",
                  position: "relative",
                  width: "200px",
                  height: "38px",
                  border: "1px solid #e2e8f0",
                  userSelect: "none"
                }}
              >
                <div style={{
                  position: "absolute",
                  left: isYearly ? "calc(50% + 1px)" : "3px",
                  width: "calc(50% - 4px)",
                  height: "calc(100% - 6px)",
                  background: "white",
                  borderRadius: "20px",
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  zIndex: 1
                }} />
                
                <div style={{ 
                  flex: 1, textAlign: "center", zIndex: 2, 
                  color: !isYearly ? "#0f172a" : "#64748b",
                  fontWeight: "700", fontSize: "12px"
                }}>Monthly</div>
                
                <div style={{ 
                  flex: 1, textAlign: "center", zIndex: 2, 
                  color: isYearly ? "var(--premium-text-primary)" : "var(--premium-text-secondary)",
                  fontWeight: "700", fontSize: "12px"
                }}>Yearly <span style={{ color: "#10b981" }}>-25%</span></div>
              </div>

            </div>
          </div>

          {/* --- MAIN CONTENT AREA --- */}
          <div style={{ width: "100%", marginTop: "24px" }}>

            {/* --- PLANS GRID --- */}
            <div style={{ 
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)", 
              gap: "48px", width: "100%", marginBottom: "48px"
            }}>
              {plans.map((p) => (
                <div key={p.name} className="premium-card" style={{
                  padding: "40px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "32px",
                  position: "relative",
                  overflow: "visible",
                  border: p.isCurrent ? "2px solid var(--premium-accent)" : "1px solid #e2e8f0",
                  background: p.isCurrent ? "white" : "white",
                  boxShadow: p.isCurrent ? "0 20px 25px -5px rgba(225, 48, 108, 0.1), 0 8px 10px -6px rgba(225, 48, 108, 0.1)" : "none"
                }}>
                  {p.isPopular && (
                    <div style={{
                      position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)",
                      background: "var(--premium-accent-gradient)",
                      color: "white", padding: "4px 16px", borderRadius: "20px",
                      fontSize: "12px", fontWeight: "900", zIndex: 10
                    }}>MOST POPULAR</div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="status-badge" style={{ 
                      background: p.name === "Pro" ? "rgba(225, 48, 108, 0.1)" : "#f1f5f9",
                      color: p.name === "Pro" ? "var(--premium-accent)" : "#64748b",
                      border: "none",
                      padding: "4px 12px"
                    }}>{p.badge}</div>
                    {p.isCurrent && <Badge tone="success">ACTIVE PLAN</Badge>}
                  </div>

                  <div>
                    <h3 style={{ fontSize: "32px", fontWeight: "900", color: "var(--premium-text-primary)", margin: 0 }}>{p.name}</h3>
                    <p style={{ fontSize: "15px", color: "var(--premium-text-secondary)", marginTop: "8px" }}>{p.description}</p>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    {p.priceMonthly === 0 ? (
                      <span style={{ fontSize: "48px", fontWeight: "900", color: "var(--premium-text-primary)" }}>Free</span>
                    ) : (
                      <>
                        <span style={{ fontSize: "28px", fontWeight: "700", color: "#94a3b8" }}>$</span>
                        <span style={{ fontSize: "48px", fontWeight: "900", color: "var(--premium-text-primary)" }}>
                          {isYearly ? p.priceYearly : p.priceMonthly}
                        </span>
                        <span style={{ fontSize: "18px", fontWeight: "600", color: "#94a3b8" }}>/ month</span>
                      </>
                    )}
                  </div>

                  <div style={{ height: "1px", background: "#f1f5f9" }} />

                  <BlockStack gap="400">
                    {p.features.map((feature, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ 
                          width: "24px", height: "24px", borderRadius: "50%", 
                          background: p.name === "Pro" ? "#f5f3ff" : "#f0fdf4",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          <Icon source={p.name === "Pro" ? MagicIcon : StarIcon} tone={p.name === "Pro" ? "magic" : "success"} />
                        </div>
                        <Text variant="bodyMd" as="span" tone="base">{feature}</Text>
                      </div>
                    ))}
                  </BlockStack>

                  <button
                    className={`premium-button ${
                      p.isCurrent 
                        ? "button-success" 
                        : (p.name === "Pro" ? "button-accent" : "button-primary")
                    }`}
                    disabled={p.isCurrent || isSubmitting}
                    onClick={() => handlePlan(p)}
                    style={{ 
                      width: "100%", 
                      height: "56px", 
                      fontSize: "17px",
                      opacity: p.isCurrent ? 0.9 : 1,
                      cursor: p.isCurrent ? "default" : "pointer"
                    }}
                  >
                    {isSubmitting && fetcher.formData?.get("planName")?.includes(p.name) ? (
                      <div className="animate-spin" style={{ width: "22px", height: "22px", border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }}></div>
                    ) : (
                      p.isCurrent ? "✓ Active Plan" : (p.name === "Pro" ? "Upgrade Now" : "Choose Starter")
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* --- FAQ SECTION --- */}
            <div className="premium-card" style={{ padding: "40px" }}>
              <div style={{ marginBottom: "24px" }}>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="h2">Have Questions?</Text>
                  <Text variant="bodyMd" as="p" tone="subdued">Everything you need to know about the plans and features.</Text>
                </BlockStack>
              </div>
              <div>
                {[
                  { q: "How does the 3-day Free Trial work?", a: "Every premium plan starts with a 3-day free trial. You won't be charged until the trial ends, and you can cancel anytime." },
                  { q: "Is Ai-Instafeed really hands-free?", a: "Yes! Once set up, the app automatically syncs your latest Instagram posts to your store." },
                  { q: "Will this slow down my store?", a: "No. Our scripts are loaded asynchronously and optimized for blazing fast performance." },
                  { q: "Do you offer support?", a: "Yes, we provide 24/7 priority support to help you with setup and customization." }
                ].map((faq, i, arr) => (
                  <FAQItem key={i} question={faq.q} answer={faq.a} isLast={i === arr.length - 1} />
                ))}
              </div>
            </div>

            <footer style={{ textAlign: "center", padding: "40px 0", marginTop: "24px" }}>
              <BlockStack gap="200">
                <Text variant="bodySm" tone="subdued">© 2026 AI Instafeed by BOOST STAR Experts</Text>
                <InlineStack gap="200" align="center">
                  <Text variant="bodySm" tone="subdued">Terms of Service</Text>
                  <Text variant="bodySm" tone="subdued">•</Text>
                  <Text variant="bodySm" tone="subdued">Privacy Policy</Text>
                </InlineStack>
              </BlockStack>
            </footer>
          </div>
        </BlockStack>
      </div>
    </div>
  );
}
