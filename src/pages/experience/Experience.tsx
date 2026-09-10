import { useEffect, useRef } from 'react';
import { emailUrl } from '@/lib/contact';
import { initExperience } from './forma/director';
import './experience.css';

/**
 * `/experience` — the cinematic, scroll-driven marketing site for Forma,
 * ported from the Forma.html design (claude.ai/design project). One
 * three.js object (a dumbbell) physically reconfigures through 15 chapters
 * — barbell, bench, rack, functional trainer, then dissolves into the real
 * product UI (client dashboard, plan builder, library, client app, progress
 * charts, business metrics) before resolving into the Forma mark. Scroll is
 * the only clock; `forma/director.ts` is the frame-by-frame resolver.
 *
 * This replaces the earlier React-Three-Fiber "GymRig" build (which only
 * got as far as Hero/Problem) — the ported design covers the whole story
 * end to end.
 */
export function Experience() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const chlabelRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Full-bleed cinematic page: avoid a white flash before the WebGL canvas
    // paints, without adding a permanent global CSS rule (this route mounts
    // inside a larger SPA whose other routes must keep their own background).
    const prevBg = document.body.style.background;
    document.body.style.background = '#000';

    const dispose = initExperience({
      canvas: canvasRef.current!,
      uiRoot: uiRef.current!,
      railRoot: railRef.current!,
      chlabelEl: chlabelRef.current!,
      spacerEl: spacerRef.current!,
      copyRoot: copyRef.current!,
      stackTarget: wrapRef.current!,
      preEl: preRef.current!,
      pctEl: pctRef.current!,
    });

    return () => {
      dispose();
      document.body.style.background = prevBg;
    };
  }, []);

  return (
    <div className="forma-exp" ref={wrapRef} data-testid="experience-page">
      <div id="pre" ref={preRef}>
        <div className="w">
          <div className="mk" />
          <div className="bw">
            <i />
          </div>
          <div className="s">
            <span>TRAIN. TRACK. TRANSFORM.</span>
            <span id="pct" ref={pctRef}>
              000
            </span>
          </div>
          <div id="prehint">
            If this stalls, something failed to load — try refreshing, or check your connection.
          </div>
        </div>
      </div>

      <div id="bar" />
      <div id="rail" ref={railRef} aria-label="Chapters" />
      <div id="chlabel" ref={chlabelRef} />

      <header className="site">
        <a className="brand" href="#" aria-label="Forma">
          <span className="wm" />
        </a>
        <nav>
          <a href="#clients">Platform</a>
          <a href="#builder">Programming</a>
          <a href="#business">Business</a>
          <a className="cta solid" href="/login?signup=1">
            Start with Forma <i>→</i>
          </a>
        </nav>
      </header>

      <canvas id="gl" ref={canvasRef} aria-hidden="true" />
      <div id="ui" ref={uiRef} aria-hidden="true" />

      <div id="copy" ref={copyRef}>
        {/* 01 HERO */}
        <div className="beat" data-ch="hero" data-a="-0.25" data-b="1.0">
          <div className="col">
            <h1>
              Build stronger clients.
              <br />
              <span className="piv">Run a stronger coaching business.</span>
            </h1>
            <p className="sub">One system for clients, plans, progress, communication and the business behind your coaching.</p>
            <div className="acts">
              <a className="cta solid" href="/login?signup=1">
                Start with Forma <i>→</i>
              </a>
              <a className="cta line" href="#builder">
                See how it works
              </a>
            </div>
            <div className="trust">For coaches · Web and mobile · useforma.fit</div>
          </div>
        </div>

        {/* 02 PROBLEM */}
        <div className="beat" data-ch="problem" data-a="0.0" data-b="0.34">
          <div className="col">
            <div className="eye">The problem</div>
            <h2>
              Coaching gets
              <br />
              complicated fast.
            </h2>
          </div>
        </div>
        <div className="beat" data-ch="problem" data-a="0.32" data-b="0.72">
          <div className="col">
            <p className="stack">
              Clients in chat.
              <br />
              Plans in spreadsheets.
              <br />
              Progress in photo folders.
              <br />
              Renewals in notes.
            </p>
          </div>
        </div>
        <div className="beat" data-ch="problem" data-a="0.7" data-b="1.0">
          <div className="col">
            <h2>
              Your coaching business
              <br />
              <span className="piv">shouldn't live in six different places.</span>
            </h2>
          </div>
        </div>

        {/* 03 ASSEMBLY */}
        <div className="beat low mid" data-ch="assembly" data-a="0.06" data-b="0.4">
          <div className="col">
            <p className="caps">
              More clients. <span>More programming. More to run.</span>
            </p>
          </div>
        </div>
        <div className="beat low mid" data-ch="assembly" data-a="0.42" data-b="0.72">
          <div className="col">
            <p className="caps">
              <span>Dumbbell. Barbell. Bench. Rack.</span> One system.
            </p>
          </div>
        </div>
        <div className="beat" data-ch="assembly" data-a="0.74" data-b="1.0">
          <div className="col">
            <div className="eye">The system evolves</div>
            <h2>
              The system grows
              <br />
              <span className="piv">with you.</span>
            </h2>
          </div>
        </div>

        {/* 04 HINGE */}
        <div className="beat" data-ch="hinge" data-a="0.7" data-b="1.3">
          <div className="col">
            <div className="eye">Materialization</div>
            <h2>
              Your training system,
              <br />
              <span className="piv">as a coaching system.</span>
            </h2>
          </div>
        </div>

        {/* 05 CLIENTS */}
        <div className="beat low" id="clients" data-ch="clients" data-a="0.0" data-b="1.0">
          <div className="col">
            <div className="eye">Client management</div>
            <h2>
              Every client.
              <br />
              One clear workspace.
            </h2>
            <ul className="fields">
              <li>Status</li>
              <li>Adherence</li>
              <li>Latest weight</li>
              <li>Assessments</li>
              <li>Messages</li>
              <li>Renewals</li>
            </ul>
          </div>
        </div>

        {/* 06 BUILDER */}
        <div className="beat low" id="builder" data-ch="builder" data-a="0.0" data-b="0.36">
          <div className="col">
            <div className="eye">Plan builder · Workout</div>
            <h2>
              Build plans
              <br />
              the way you coach.
            </h2>
            <ul className="fields">
              <li>Training day</li>
              <li>Warm-up</li>
              <li>Working sets</li>
              <li>Reps</li>
              <li>Load</li>
              <li>Rest</li>
              <li>Video</li>
            </ul>
          </div>
        </div>
        <div className="beat low" data-ch="builder" data-a="0.36" data-b="0.7">
          <div className="col">
            <div className="eye">Plan builder · Nutrition</div>
            <h2>
              Meals, foods,
              <br />
              macros, alternatives.
            </h2>
          </div>
        </div>
        <div className="beat low" data-ch="builder" data-a="0.7" data-b="1.0">
          <div className="col">
            <div className="eye">Plan builder · Cardio</div>
            <h2>
              Workout. Nutrition. Cardio.
              <br />
              <span className="piv">One programming system.</span>
            </h2>
          </div>
        </div>

        {/* 07 LIBRARY */}
        <div className="beat low" data-ch="library" data-a="0.0" data-b="1.0">
          <div className="col">
            <div className="eye">Library</div>
            <h2>
              Build once.
              <br />
              <span className="piv">Reuse intelligently.</span>
            </h2>
            <p className="sub">Reusable exercises, foods and templates — still yours to customize.</p>
          </div>
        </div>

        {/* 08 HANDOFF */}
        <div className="beat low" data-ch="handoff" data-a="0.4" data-b="1.0">
          <div className="col">
            <div className="eye">Coach → client</div>
            <h2>
              Powerful for the coach.
              <br />
              <span className="piv">Simple for the client.</span>
            </h2>
            <ul className="fields">
              <li>Today</li>
              <li>Workout</li>
              <li>Nutrition</li>
              <li>Progress</li>
              <li>Assessments</li>
              <li>Messages</li>
            </ul>
          </div>
        </div>

        {/* 09 REALTIME */}
        <div className="beat low mid" data-ch="realtime" data-a="0.0" data-b="1.0">
          <div className="col">
            <div className="eye">Real-time coaching</div>
            <h2>
              The session ends.
              <br />
              <span className="piv">The coaching doesn't.</span>
            </h2>
          </div>
        </div>

        {/* 10 PROGRESS */}
        <div className="beat low" data-ch="progress" data-a="0.34" data-b="1.0">
          <div className="col">
            <div className="eye">Progress</div>
            <h2>
              See what's
              <br />
              actually happening.
            </h2>
            <p className="stack">
              Progress becomes visible.
              <br />
              Adherence becomes measurable.
              <br />
              <span className="piv">Decisions become easier.</span>
            </p>
          </div>
        </div>

        {/* 11 BUSINESS */}
        <div className="beat low" id="business" data-ch="business" data-a="0.3" data-b="1.0">
          <div className="col">
            <div className="eye">The business</div>
            <h2>
              Coach the client.
              <br />
              Understand the business.
            </h2>
            <p className="quote">Forma isn't only managing training — it's managing the practice behind it.</p>
          </div>
        </div>

        {/* 12 SCALE */}
        <div className="beat low mid" data-ch="scale" data-a="0.3" data-b="1.0">
          <div className="col">
            <div className="eye">Scale</div>
            <h2>
              Built to grow with
              <br />
              your coaching business.
            </h2>
          </div>
        </div>

        {/* 13 BEFORE / AFTER */}
        <div className="beat low mid" data-ch="beforeafter" data-a="0.0" data-b="0.42">
          <div className="col">
            <p className="caps">
              <span>Messages. Spreadsheets. PDFs. Photos. Notes. Manual renewals.</span>
            </p>
          </div>
        </div>
        <div className="beat low" data-ch="beforeafter" data-a="0.6" data-b="1.0">
          <div className="col">
            <div className="eye">Before / after</div>
            <h2>
              Less admin.
              <br />
              <span className="piv">More coaching.</span>
            </h2>
          </div>
        </div>

        {/* 14 FINAL */}
        <div className="beat mid" data-ch="final" data-a="0.6" data-b="1.0">
          <div className="col" style={{ marginTop: '24vh' }}>
            <h1>
              Your coaching system.
              <br />
              <span className="piv">Finally in one place.</span>
            </h1>
            <p className="sub" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              Clients. Plans. Progress. Communication. Business. <span className="piv">One system.</span>
            </p>
            <div className="acts" style={{ justifyContent: 'center' }}>
              <a className="cta solid" href="/login?signup=1">
                Start with Forma <i>→</i>
              </a>
              <a className="cta line" href={emailUrl('Forma demo request')}>
                Book a demo
              </a>
            </div>
          </div>
        </div>

        {/* 15 CLOSE / FOOTER */}
        <div className="beat" data-ch="close" data-a="0.0" data-b="1.0">
          <div className="foot">
            <div className="fbrand">
              <a className="brand fl" href="#" aria-label="Forma — train, track, transform" style={{ marginBottom: '22px' }}>
                <span className="lk" />
              </a>
              <h2>
                Your coaching
                <br />
                system.
              </h2>
              <div className="acts">
                <a className="cta solid" href="/login?signup=1">
                  Start with Forma <i>→</i>
                </a>
                <a className="cta line" href={emailUrl('Forma demo request')}>
                  Book a demo
                </a>
              </div>
            </div>
            <div>
              <h5>Platform</h5>
              <ul>
                <li>
                  <a href="#clients">Client management</a>
                </li>
                <li>
                  <a href="#builder">Plan builder</a>
                </li>
                <li>
                  <a href="#builder">Nutrition</a>
                </li>
                <li>
                  <a href="#builder">Cardio</a>
                </li>
                <li>
                  <a href="#business">Business</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Library</h5>
              <ul>
                <li>
                  <a href="#">Exercises</a>
                </li>
                <li>
                  <a href="#">Foods</a>
                </li>
                <li>
                  <a href="#">Templates</a>
                </li>
                <li>
                  <a href="#">Assessments</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Company</h5>
              <ul>
                <li>
                  <a href="#">About</a>
                </li>
                <li>
                  <a href={emailUrl('Forma demo request')}>Book a demo</a>
                </li>
                <li>
                  <a href={emailUrl()}>Contact</a>
                </li>
                <li>
                  <a href="#">Privacy</a>
                </li>
                <li>
                  <a href="#">Terms</a>
                </li>
              </ul>
            </div>
            <div className="legal">
              <span>useforma.fit</span>
              <span>© 2026 Forma</span>
            </div>
          </div>
        </div>
      </div>

      <div id="spacer" ref={spacerRef} />

      {/* crawlable / no-JS narrative: the full story as real text */}
      <article className="seo">
        <h1>Forma — your coaching system, finally in one place</h1>
        <p>
          Forma is the operating system between a fitness coach, their clients, their programming, their communication, their progress and
          their coaching business. One system for clients, plans, progress, communication and the business behind your coaching.
        </p>
        <h2>Coaching gets complicated fast</h2>
        <p>
          Clients in chat. Plans in spreadsheets. Progress in photo folders. Renewals in notes. Your coaching business shouldn't live in six
          different places.
        </p>
        <h2>Every client, one clear workspace</h2>
        <p>Client status, subscription, adherence, latest weight, assessment state, unread messages and next renewal — per client, at a glance.</p>
        <h2>Build plans the way you coach</h2>
        <p>
          Workout, nutrition and cardio in one programming system. Training days, warm-ups, working sets, exercises, sets, reps, load, rest and
          video. Meals, foods, serving sizes, macros and alternatives. Cardio type, duration, intensity and schedule.
        </p>
        <h2>Build once, reuse intelligently</h2>
        <p>A reusable exercise library and food library with templates, still fully customizable by the coach.</p>
        <h2>Powerful for the coach, simple for the client</h2>
        <p>The Forma client app: Today, Workout, Nutrition, Progress, Assessments and Messages.</p>
        <h2>The session ends, the coaching doesn't</h2>
        <p>Messages, completed workouts, progress uploads and assessment submissions move continuously between coach and client.</p>
        <h2>See what's actually happening</h2>
        <p>
          Weight trend, workout adherence, nutrition adherence, assessment completion and a progress-photo timeline. Progress becomes visible,
          adherence becomes measurable, decisions become easier.
        </p>
        <h2>Coach the client, understand the business</h2>
        <p>Active clients, renewals this week, due this month, collected this month, retention, churn and expiring subscriptions.</p>
        <h2>Built to grow with your coaching business</h2>
        <p>
          Forma is infrastructure: coaches, clients, workout plans, nutrition plans, cardio, assessments, progress, messages, subscriptions,
          exercise library, food library and templates.
        </p>
        <h2>Less admin. More coaching.</h2>
        <p>Start with Forma, or book a demo at useforma.fit.</p>
      </article>
      <noscript>
        <div className="seo">
          <h1>Forma — your coaching system, finally in one place</h1>
          <p>
            One system for clients, plans, progress, communication and the business behind your coaching. Visit useforma.fit to start with Forma
            or book a demo.
          </p>
        </div>
      </noscript>
    </div>
  );
}
