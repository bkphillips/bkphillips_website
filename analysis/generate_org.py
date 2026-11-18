"""Generate a synthetic company for the Kestrel Org Explorer.

Simulates about 5,000 employees over 36 months: reporting lines, levels,
locations, hires, exits and office attendance. Four events are planted in the
history so the site's detection models have something real to find:

    month 10  layoff            involuntary exits, concentrated in a few functions
    month 14  hiring resumes    the freeze that followed the layoff ends
    month 16  return to office  attendance rises; remote staff quit more for a while
    month 25  delayering        a layer of middle managers is removed in three functions

Everything is fictional. Output: src/data/org.json (compact, read by the site).

    python analysis/generate_org.py
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

SEED = 11
MONTHS = 36
START_YEAR, START_MONTH = 2023, 11
START_HEADCOUNT = 4700
LAYOFF_M, RTO_M, REORG_M = 10, 16, 25
FREEZE_MONTHS = 4  # hiring stops for this long after the layoff
COMPANY = "Kestrel"

rng = np.random.default_rng(SEED)

LOCATIONS = [
    "San Francisco", "New York", "Seattle", "Austin", "Chicago",
    "London", "Amsterdam", "Bangalore", "São Paulo", "Remote",
]
REMOTE = LOCATIONS.index("Remote")
IC_PREFIX = {3: "Associate ", 4: "", 5: "Senior ", 6: "Staff ", 7: "Principal "}


@dataclass
class Function:
    name: str
    share: float
    span: int            # target span for first-line managers
    quit_rate: float     # baseline monthly voluntary exit probability
    layoff_rate: float   # share cut in the layoff month
    role: str
    head_title: str
    teams: list[str]
    locations: dict[str, float]
    office_days: float   # typical days a week in office before the mandate


FUNCTIONS = [
    Function("Engineering", 0.34, 7, 0.008, 0.04, "Software Engineer", "Chief Technology Officer",
             ["Platform", "Infrastructure", "Mobile", "Web", "Data", "Security", "Payments", "Search"],
             {"San Francisco": 30, "Seattle": 20, "Bangalore": 18, "Amsterdam": 10, "New York": 7, "Remote": 15}, 1.5),
    Function("Product", 0.06, 6, 0.009, 0.06, "Product Manager", "Chief Product Officer",
             ["Core Product", "Growth", "Marketplace", "Product Ops"],
             {"San Francisco": 45, "New York": 20, "Seattle": 12, "London": 8, "Remote": 15}, 1.9),
    Function("Design", 0.04, 6, 0.009, 0.07, "Product Designer", "VP, Design",
             ["Product Design", "Research", "Brand"],
             {"San Francisco": 40, "New York": 22, "Amsterdam": 13, "Remote": 25}, 1.6),
    Function("Sales", 0.18, 9, 0.016, 0.15, "Account Executive", "Chief Revenue Officer",
             ["Enterprise", "Mid-Market", "SMB", "Solutions", "Sales Ops", "Partnerships"],
             {"New York": 26, "Chicago": 20, "London": 16, "Austin": 12, "São Paulo": 10, "San Francisco": 6, "Remote": 10}, 2.3),
    Function("Customer Support", 0.14, 12, 0.018, 0.06, "Support Specialist", "VP, Customer Support",
             ["Tier 1", "Tier 2", "Trust & Safety", "Support Ops"],
             {"Austin": 34, "Bangalore": 28, "São Paulo": 12, "Chicago": 8, "Remote": 18}, 2.0),
    Function("Marketing", 0.07, 6, 0.011, 0.17, "Marketing Specialist", "Chief Marketing Officer",
             ["Brand Marketing", "Performance", "Product Marketing", "Events"],
             {"New York": 32, "San Francisco": 28, "London": 14, "Remote": 26}, 1.7),
    Function("Operations", 0.08, 8, 0.010, 0.05, "Operations Analyst", "Chief Operating Officer",
             ["Strategy & Planning", "Business Ops", "Workplace", "IT"],
             {"San Francisco": 30, "Austin": 24, "Chicago": 16, "Amsterdam": 10, "Remote": 20}, 2.2),
    Function("Finance", 0.04, 6, 0.007, 0.05, "Financial Analyst", "Chief Financial Officer",
             ["FP&A", "Accounting", "Treasury"],
             {"San Francisco": 44, "New York": 30, "London": 12, "Remote": 14}, 2.4),
    Function("People", 0.04, 6, 0.010, 0.13, "People Partner", "Chief People Officer",
             ["Recruiting", "People Partners", "Total Rewards"],
             {"San Francisco": 36, "New York": 22, "Austin": 14, "London": 8, "Remote": 20}, 2.0),
    Function("Legal", 0.01, 5, 0.006, 0.03, "Counsel", "General Counsel",
             ["Commercial", "Compliance"],
             {"San Francisco": 50, "New York": 30, "London": 10, "Remote": 10}, 2.2),
]
DELAYERED = {"Engineering", "Operations", "Product"}

FIRST = """Aaliyah Aditi Ahmed Aiko Alejandro Amara Amir Ana Andre Anika Arjun Astrid Ayesha Beatriz Ben
Bianca Callum Camila Carlos Chen Chloe Daniel Darius Deepa Diego Dmitri Elena Elif Emeka Emma Esther Ethan Fatima
Felix Freya Gabriel Grace Hana Hassan Hiroshi Ibrahim Imani Ines Isabel Ivan Jamal Jasmine Javier Jia Jonas Julia
Kai Kavya Kenji Kofi Lars Layla Leila Liam Lina Lucas Luis Maya Mei Miguel Mina Mohammed Naomi Nia Nikhil Noah
Nora Olivia Omar Priya Rafael Rahul Rosa Ryan Sadia Samir Sana Santiago Sara Sofia Soren Tariq Tatiana Thabo Thomas
Uma Valentina Victor Wei Yara Yusuf Zainab Zoe Marcus Hannah Owen Ruth Tobias Ingrid Pablo Simone""".split()
LAST = """Abdi Adeyemi Aguilar Ahn Akhtar Almeida Andersson Baker Banerjee Barros Bauer Bello Bianchi Brooks
Castillo Chaudhry Chen Cho Cohen Costa Cruz Dang Das Dlamini Dubois Eriksen Farah Fernandez Fischer Flores Fofanah
Gallo Garcia Gupta Haddad Hall Hansen Haruna Hashemi Hernandez Hoang Hossain Huang Ibarra Iyer Jackson Jansen
Jimenez Joshi Kang Kaplan Kaur Khan Kim Kowalski Kumar Lam Larsen Lee Lin Lopez Mahlangu Malik Martins Mehta
Mendoza Mensah Meyer Mishra Moreno Morris Murphy Nair Nakamura Ncube Nguyen Novak Obi Okafor Oliveira Omondi Ortiz
Osei Park Patel Pereira Petrov Pham Popov Qureshi Rahman Ramos Rao Reyes Rossi Saito Santos Sato Schmidt Shah
Sharma Silva Singh Sokolov Suarez Tanaka Tran Vargas Vega Wang Watanabe Weber Williams Wong Yamamoto Yang Yilmaz
Zhang Zhou Ziegler Oyelaran Lindqvist Marchetti Abara Sandoval Thackeray""".split()
NAMES = [f"{a} {b}" for a in FIRST for b in LAST]
rng.shuffle(NAMES)


@dataclass
class Person:
    id: int
    name: str
    fn: int               # index into FUNCTIONS, -1 for the CEO
    team: int             # index into TEAMS (0 = none)
    loc: int
    level: int            # IC level 3-7
    hire: int             # month index; negative means before the window
    mgr: int
    base_days: float
    compliance: float
    protected: bool = False   # CEO and function heads
    stays: bool = False       # never leaves during the window (heads and team leads)
    exit: int = -1
    exit_type: int = 0    # 1 voluntary, 2 involuntary
    title: str = ""
    kids: set[int] = field(default_factory=set)
    hist: list[list[int]] = field(default_factory=list)


people: dict[int, Person] = {}
TEAMS = [""]


def sample_location(fn: Function, parent: Person | None, p_same: float = 0.72) -> int:
    """Remote at the function's remote rate; otherwise the manager's office or one from the mix."""
    total = sum(fn.locations.values())
    if rng.random() < fn.locations.get("Remote", 0) / total:
        return REMOTE
    if parent is not None and parent.loc != REMOTE and rng.random() < p_same:
        return parent.loc
    names = [n for n in fn.locations if n != "Remote"]
    weights = np.array([fn.locations[n] for n in names], dtype=float)
    return LOCATIONS.index(names[rng.choice(len(names), p=weights / weights.sum())])


def add_person(fn_idx: int, parent: Person | None, hire: int, team: int = 0, senior: bool = False,
               p_same: float = 0.72) -> Person:
    fn = FUNCTIONS[fn_idx] if fn_idx >= 0 else None
    loc = sample_location(fn, parent, p_same) if fn else 0
    remote = loc == REMOTE
    level = int(rng.choice([3, 4, 5, 6, 7], p=[0.05, 0.2, 0.4, 0.27, 0.08] if senior else [0.22, 0.36, 0.28, 0.11, 0.03]))
    base = abs(rng.normal(0.1, 0.15)) if remote else float(np.clip(rng.normal(fn.office_days if fn else 3, 0.8), 0, 4.5))
    p = Person(
        id=len(people) + 1, name=NAMES[len(people)], fn=fn_idx, team=team, loc=loc, level=level,
        hire=hire, mgr=parent.id if parent else 0, base_days=base,
        compliance=float(np.clip(rng.normal(1, 0.25), 0.3, 1.5)),
    )
    p.hist.append([max(hire, 0), p.mgr])
    people[p.id] = p
    if parent:
        parent.kids.add(p.id)
    return p


def tenure_hire() -> int:
    return -int(min(rng.exponential(30) + 1, 120))


def build_org(leader: Person, n: int, fn_idx: int, depth: int) -> None:
    """Fill the org under `leader` so that it holds n people including the leader."""
    fn = FUNCTIONS[fn_idx]
    rest = n - 1
    if rest <= 0:
        return
    if rest <= fn.span * 1.5:
        for _ in range(rest):
            add_person(fn_idx, leader, tenure_hire(), leader.team)
        return
    # A function head has one direct report per named team; below that, spans vary.
    k = len(fn.teams) if depth == 1 else int(np.clip(round(rng.normal(4.6, 1.4)), 2, 8))
    k = min(k, max(2, rest // 4))
    sizes = np.maximum(2, np.round(rng.dirichlet(np.full(k, 6.0)) * rest).astype(int))
    sizes[-1] = max(1, sizes[-1] + rest - sizes.sum())
    for i, size in enumerate(sizes):
        team = leader.team
        if depth == 1:
            TEAMS.append(fn.teams[i])
            team = len(TEAMS) - 1
        child = add_person(fn_idx, leader, tenure_hire() - 12, team, senior=True,
                           p_same=0.3 if depth == 1 else 0.6)
        child.stays = depth == 1  # named teams keep one leader, so their history is continuous
        build_org(child, int(size), fn_idx, depth + 1)


def height(p: Person) -> int:
    return 0 if not p.kids else 1 + max(height(people[k]) for k in p.kids)


def title_of(p: Person) -> str:
    if p.fn < 0:
        return "Chief Executive Officer"
    fn = FUNCTIONS[p.fn]
    if p.protected:
        return fn.head_title
    if p.kids:
        rank = ["Manager", "Director", "Senior Director", "Vice President"][min(height(p), 4) - 1]
        return f"{rank}, {TEAMS[p.team] or fn.name}"
    return f"{IC_PREFIX[p.level]}{fn.role}"


def set_manager(pid: int, new_mgr: int, month: int) -> None:
    p = people[pid]
    people[p.mgr].kids.discard(pid)
    p.mgr = new_mgr
    people[new_mgr].kids.add(pid)
    if p.hist[-1][0] == month:
        p.hist[-1][1] = new_mgr
    else:
        p.hist.append([month, new_mgr])


def remove(p: Person, month: int, exit_type: int) -> None:
    """Person leaves. If they managed people, their most senior report steps up."""
    p.title = title_of(p)
    p.exit, p.exit_type = month, exit_type
    people[p.mgr].kids.discard(p.id)
    if p.kids:
        kids = list(p.kids)
        successor = max(kids, key=lambda k: (bool(people[k].kids), people[k].level, -people[k].hire))
        p.kids = set()
        people[successor].mgr = p.id  # so set_manager detaches cleanly
        set_manager(successor, p.mgr, month)
        for k in kids:
            if k != successor:
                people[k].mgr = p.id
                set_manager(k, successor, month)


def active() -> list[Person]:
    return [p for p in people.values() if p.exit < 0]


# ---------- Starting organisation ----------
ceo = add_person(-1, None, -96)
ceo.protected = True
for i, fn in enumerate(FUNCTIONS):
    head = add_person(i, ceo, tenure_hire() - 24, senior=True, p_same=0.0)
    head.protected = True
    build_org(head, round(START_HEADCOUNT * fn.share), i, 1)

team_layoff_mult = {t: float(rng.uniform(0.3, 2.4)) for t in range(len(TEAMS))}
targets = {i: float(sum(1 for p in active() if p.fn == i)) for i in range(len(FUNCTIONS))}

# ---------- Month by month ----------
for m in range(1, MONTHS):
    calendar_month = (START_MONTH - 1 + m) % 12 + 1

    # Exits
    leaving: list[tuple[int, int]] = []
    for p in active():
        if p.protected or p.stays:
            continue
        fn = FUNCTIONS[p.fn]
        tenure = m - p.hire
        quit_p = fn.quit_rate * (1.5 if tenure < 12 else 0.7 if tenure > 48 else 1.0)
        quit_p *= 1.2 if calendar_month in (1, 2, 3) else 1.0
        if RTO_M <= m < RTO_M + 5:
            away = p.loc == REMOTE or people[p.mgr].loc != p.loc
            quit_p *= 3.4 if away else 1.4
        fired_p = 0.0015
        if m == LAYOFF_M:
            fired_p = min(0.6, fn.layoff_rate * team_layoff_mult[p.team])
        roll = rng.random()
        if roll < fired_p:
            leaving.append((p.id, 2))
        elif roll < fired_p + quit_p:
            leaving.append((p.id, 1))
    for pid, kind in leaving:
        remove(people[pid], m, kind)

    # Delayering: remove managers who only manage a few other managers
    if m == REORG_M:
        for p in sorted(active(), key=lambda q: q.id):
            if p.protected or p.exit >= 0 or FUNCTIONS[p.fn].name not in DELAYERED:
                continue
            if people[p.mgr].protected:
                continue  # team leads stay; the cut is to the layers beneath them
            if not p.kids or not all(people[k].kids for k in p.kids):
                continue
            if rng.random() > (0.8 if len(p.kids) <= 5 else 0.3):
                continue
            for k in list(p.kids):
                set_manager(k, p.mgr, m)
            if rng.random() < 0.55:
                remove(p, m, 2)
            else:
                p.level = 6  # stays on as a senior individual contributor

    # Hiring: growth, then a freeze after the layoff, then slower growth
    for i, fn in enumerate(FUNCTIONS):
        current = sum(1 for p in active() if p.fn == i)
        if m < LAYOFF_M:
            targets[i] *= 1.013
        elif m < LAYOFF_M + FREEZE_MONTHS:
            targets[i] = current
        else:
            targets[i] = max(targets[i], current * 0.99) * 1.007
        hires = int(round(targets[i] - current))
        if hires <= 0:
            continue
        managers = [p for p in active() if p.fn == i and p.kids and height(p) == 1]
        if not managers:
            managers = [p for p in active() if p.fn == i and p.kids]
        for _ in range(hires):
            weights = np.array([1 / (len(q.kids) + 1) ** 2 for q in managers])
            boss = managers[rng.choice(len(managers), p=weights / weights.sum())]
            hire = add_person(i, boss, m, boss.team)
            if m >= RTO_M and hire.loc != boss.loc and boss.loc != REMOTE and rng.random() < 0.5:
                hire.loc = boss.loc  # hiring is steered toward the manager's office after the mandate

        # Split teams that have grown too wide
        for boss in managers:
            if boss.exit >= 0 or len(boss.kids) <= round(fn.span * 1.7):
                continue
            kids = sorted(boss.kids, key=lambda k: (-people[k].level, people[k].hire))
            lead, moved = kids[0], kids[1::2]
            set_manager(lead, boss.mgr, m)
            for k in moved:
                set_manager(k, lead, m)

for p in active():
    p.title = title_of(p)


# ---------- Attendance ----------
def attendance(p: Person) -> str:
    start = max(p.hire, 0)
    end = p.exit if p.exit >= 0 else MONTHS
    office = p.loc != REMOTE
    out = []
    for m in range(start, end):
        calendar_month = (START_MONTH - 1 + m) % 12 + 1
        # The mandate lifts attendance at once; compliance then fades slowly.
        lift = 1.5 - 0.012 * (m - RTO_M) if m >= RTO_M else 0.0
        lift *= p.compliance * (1.0 if office else 0.1)
        season = {12: -0.35, 8: -0.15, 7: -0.1}.get(calendar_month, 0.0) * (1.0 if office else 0.2)
        days = float(np.clip(p.base_days + lift + season + rng.normal(0, 0.25), 0, 5))
        out.append(np.base_repr(int(round(days * 2)), 36).lower())
    return "".join(out)


# ---------- Output ----------
titles: list[str] = []
title_index: dict[str, int] = {}
rows = []
for p in people.values():
    if p.title not in title_index:
        title_index[p.title] = len(titles)
        titles.append(p.title)
    level = p.level if not p.kids else 6 + height(p)
    rows.append([
        p.id, p.name, title_index[p.title], 12 if p.fn < 0 else level, p.fn, p.team, p.loc,
        p.hire, p.exit, p.exit_type, [x for pair in p.hist for x in pair], attendance(p),
    ])

months = [f"{START_YEAR + (START_MONTH - 1 + m) // 12}-{(START_MONTH - 1 + m) % 12 + 1:02d}" for m in range(MONTHS)]
data = {
    "meta": {
        "company": COMPANY,
        "seed": SEED,
        "months": months,
        "events": [
            {"month": LAYOFF_M, "label": "Layoff", "detail": "Company-wide cut, heaviest in Marketing, Sales and People."},
            {"month": LAYOFF_M + FREEZE_MONTHS, "label": "Hiring resumes", "detail": "The post-layoff hiring freeze ends and teams start growing again."},
            {"month": RTO_M, "label": "Return-to-office mandate", "detail": "Office staff are asked to come in three days a week."},
            {"month": REORG_M, "label": "Delayering", "detail": "A layer of middle managers is removed in Engineering, Operations and Product."},
        ],
    },
    "functions": [f.name for f in FUNCTIONS],
    "teams": TEAMS,
    "locations": LOCATIONS,
    "titles": titles,
    "people": rows,
}

out = Path(__file__).resolve().parent.parent / "src" / "data" / "org.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))

final = active()
print(f"wrote {out.relative_to(out.parent.parent.parent)}: {out.stat().st_size / 1e6:.2f} MB")
print(f"people ever: {len(people)}, active at end: {len(final)}, managers: {sum(1 for p in final if p.kids)}")
for m in (0, LAYOFF_M - 1, LAYOFF_M, RTO_M, REORG_M - 1, REORG_M, MONTHS - 1):
    n = sum(1 for p in people.values() if p.hire <= m and (p.exit < 0 or p.exit > m))
    print(f"  month {m:2d} ({months[m]}): headcount {n}")
print("exits:", sum(1 for p in people.values() if p.exit_type == 1), "voluntary,",
      sum(1 for p in people.values() if p.exit_type == 2), "involuntary")
