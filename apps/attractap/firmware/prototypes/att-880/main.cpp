// THROWAWAY ATT-880 review prototype, not an implementation of the firmware flow.
// Question: do flush row actions, authentication, async feedback and return paths
// make sense at the actual 480 x 480 display size? All data is fictional.
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/images/logo_40h.hpp"
#include "display/images/lockscreen_background_image.hpp"
#include <array>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace T = DisplayTheme;
const lv_font_t *font(int size) {
    switch(size) {
    case 14: return &attractap_font_montserrat_latin1_14;
    case 16: return &attractap_font_montserrat_latin1_16;
    case 20: return &attractap_font_montserrat_latin1_20;
    case 24: return &attractap_font_montserrat_latin1_24;
    case 28: return &attractap_font_montserrat_latin1_28;
    case 32: return &attractap_font_montserrat_latin1_32;
    default: return &attractap_font_montserrat_latin1_18;
    }
}
lv_obj_t *box(lv_obj_t *p, int x, int y, int w, int h, lv_color_t color, int radius=6) {
    auto *o=lv_obj_create(p); lv_obj_remove_style_all(o);
    lv_obj_set_pos(o,x,y); lv_obj_set_size(o,w,h);
    lv_obj_set_style_bg_color(o,color,0); lv_obj_set_style_bg_opa(o,255,0);
    lv_obj_set_style_radius(o,radius,0); lv_obj_remove_flag(o,LV_OBJ_FLAG_SCROLLABLE);
    return o;
}
lv_obj_t *label(lv_obj_t *p, const std::string &s, int x,int y,int w,int size=18,lv_color_t c=T::text()) {
    auto *o=lv_label_create(p); lv_label_set_text(o,s.c_str());
    lv_obj_set_pos(o,x,y); lv_obj_set_width(o,w); lv_obj_set_style_text_font(o,font(size),0);
    lv_obj_set_style_text_color(o,c,0); lv_label_set_long_mode(o,LV_LABEL_LONG_WRAP);
    return o;
}
void centered(lv_obj_t *p,const std::string &s,int size,lv_color_t c) {
    auto *o=label(p,s,0,0,lv_obj_get_style_width(p,0)-16,size,c);
    lv_obj_set_style_text_align(o,LV_TEXT_ALIGN_CENTER,0); lv_obj_center(o);
}
lv_obj_t *button(lv_obj_t *p,const std::string &s,int x,int y,int w,int h,lv_color_t bg=T::primary(),lv_color_t fg=T::onPrimary()) {
    auto *o=lv_button_create(p); T::button(o,bg,fg);
    lv_obj_set_pos(o,x,y);lv_obj_set_size(o,w,h);lv_obj_set_style_pad_all(o,0,0);
    centered(o,s,18,fg);return o;
}
void logo(lv_obj_t *p) {auto *o=lv_image_create(p);lv_image_set_src(o,&logo_40h);lv_obj_set_pos(o,173,20);}
lv_obj_t *screen(bool background=false) {
    auto *o=lv_obj_create(nullptr);T::applyScreen(o);lv_obj_set_style_pad_all(o,0,0);
    lv_obj_remove_flag(o,LV_OBJ_FLAG_SCROLLABLE);
    if(background)lv_obj_set_style_bg_image_src(o,&lockscreen_background_image,0);
    return o;
}
void header(lv_obj_t *p,int seconds=30,bool busy=false) {
    auto *logout=button(p,"Abmelden",20,20,104,46,T::danger(),T::onPrimary());
    lv_obj_set_style_text_font(lv_obj_get_child(logout,0),font(14),0);
    label(p,"jappy",140,19,210,16);
    auto *time=label(p,busy?"Pausiert":std::to_string(seconds)+" s",360,19,100,14,T::muted());
    lv_obj_set_style_text_align(time,LV_TEXT_ALIGN_RIGHT,0);
    box(p,140,47,320,9,T::primarySoft(),3);
    box(p,140,47,busy?320:320*seconds/30,9,seconds<=5?T::warning():T::primary(),3);
}
void footer(lv_obj_t *p,const std::string &s) {label(p,s,20,448,440,14,T::muted());}
void notice(lv_obj_t *p,const std::string &s,lv_color_t bg=T::successSoft(),lv_color_t fg=T::success()) {
    auto *o=box(p,20,390,440,44,bg);centered(o,s,16,fg);
}
void row(lv_obj_t *p,int y,const std::string &name,const std::string &sub,const std::string &action,lv_color_t color,bool split) {
    // One clipped outer shape. The two 220 px halves meet without padding or inner radii.
    auto *o=box(p,20,y,440,72,T::surfaceSecondary());
    lv_obj_set_style_clip_corner(o,true,0);
    int left=split?220:420;
    auto *nameLabel=label(o,name,14,11,left-26,20);
    lv_obj_set_height(nameLabel,25);lv_label_set_long_mode(nameLabel,LV_LABEL_LONG_DOT);
    auto *subLabel=label(o,sub,14,43,left-26,14,T::muted());
    lv_obj_set_height(subLabel,19);lv_label_set_long_mode(subLabel,LV_LABEL_LONG_DOT);
    if(split) {
        auto *right=box(o,220,0,220,72,color,0);
        centered(right,action,20,T::onPrimary());
    } else box(o,420,0,20,72,color,0);
}
lv_obj_t *list(const std::string &id) {
    bool guest=id=="01-home"||id=="31-logged-out"||id=="32-expired";
    auto *p=screen(true);
    if(guest)logo(p);else header(p,id=="30-expiring"?5:30,id=="06-starting"||id=="08-stopping"||id=="22-door-pending");
    bool active=id=="07-started";
    bool stopped=id=="09-stopped";
    bool other=id=="24-other-user";
    bool noAccess=id=="26-no-introduction";
    bool single=id=="34-one-resource";
    row(p,86,"Lasercutter",active?"Von dir verwendet":"Werkstatt · verfügbar",active?"Stop":"Start",active?T::danger():T::success(),!guest);
    if(!single) {
        row(p,168,"3D-Drucker",other?"In Verwendung: Mia":stopped?"Druckraum · verfügbar":guest?"In Verwendung: jappy":"Von dir verwendet",other?"Belegt":stopped?"Start":"Stop",other?T::muted():stopped?T::success():T::danger(),!guest);
        row(p,250,"Tischkreissäge",noAccess?"Einweisung fehlt":"Wartung",noAccess?"Einweisung":"Gesperrt",T::warning(),!guest);
        row(p,332,"Werkstatttür","Zugang zur Werkstatt","Öffnen",T::primary(),!guest);
    }
    if(guest)footer(p,id=="32-expired"?"Abgemeldet · Bitte NFC-Karte auflegen":id=="31-logged-out"?"Abgemeldet · Laufende Nutzung bleibt aktiv":"NFC-Karte auflegen oder Ressource öffnen");
    else if(id=="07-started")footer(p,"Gestartet · Lasercutter wird von dir verwendet");
    else if(id=="09-stopped")footer(p,"Beendet · 3D-Drucker ist wieder verfügbar");
    else if(id=="30-expiring")footer(p,"Berühren, um angemeldet zu bleiben");
    else if(single)label(p,"Details links · Start rechts",20,182,440,18,T::muted());
    else footer(p,"Ressource links: Details · Aktion rechts");
    return p;
}
void overlay(lv_obj_t *p) {auto *o=box(p,0,0,480,480,lv_color_black(),0);lv_obj_set_style_bg_opa(o,185,0);}
void spinner(lv_obj_t *p,int x,int y) {
    auto *o=lv_spinner_create(p);lv_obj_set_pos(o,x,y);lv_obj_set_size(o,38,38);
    lv_obj_set_style_arc_color(o,T::primarySoft(),LV_PART_MAIN);
    lv_obj_set_style_arc_color(o,T::primary(),LV_PART_INDICATOR);
    lv_spinner_set_anim_params(o,1000,220);
}
lv_obj_t *busy(const std::string &id) {
    auto *p=list(id=="03-authenticating"?"01-home":id);
    overlay(p);auto *o=box(p,38,155,404,172,T::surface());spinner(o,183,22);
    std::string title=id=="03-authenticating"?"Karte wird geprüft":id=="08-stopping"?"Nutzung wird beendet":id=="22-door-pending"?"Tür wird geöffnet":"Nutzung wird gestartet";
    auto *l=label(o,title,14,76,376,20);lv_obj_set_style_text_align(l,LV_TEXT_ALIGN_CENTER,0);
    auto *d=label(o,id=="03-authenticating"?"Einen Moment bitte ...":id=="08-stopping"?"3D-Drucker · Bitte warten":id=="22-door-pending"?"Werkstatttür · Bitte warten":"Lasercutter · Bitte warten",14,117,376,16,T::muted());
    lv_obj_set_style_text_align(d,LV_TEXT_ALIGN_CENTER,0);return p;
}
lv_obj_t *details(const std::string &id) {
    auto *p=screen();header(p);button(p,"< Liste",20,83,92,36,T::surfaceSecondary(),T::text());
    std::string title=id=="21-door-details"||id=="23-door-opened"?"Werkstatttür":id=="25-takeover"?"3D-Drucker":id=="27-maintenance"||id=="28-introduction-details"?"Tischkreissäge":"Lasercutter";
    label(p,title,20,136,440,32);
    label(p,id=="13-active-details"?"Von dir verwendet · 00:12:34":id=="25-takeover"?"In Verwendung: Mia seit 10:24 Uhr":id=="27-maintenance"?"Wartung · Nutzung gesperrt":id=="28-introduction-details"?"Einweisung erforderlich":"Werkstatt · verfügbar",20,183,440,16,id=="27-maintenance"?T::warning():T::muted());
    if(id=="27-maintenance"||id=="28-introduction-details") {
        auto *o=box(p,20,227,440,145,T::warningSoft());
        label(o,id=="27-maintenance"?"Aktuell nicht verfügbar":"Noch keine Einweisung",16,16,408,20,T::warning());
        label(o,id=="27-maintenance"?"Diese Ressource wird gewartet.\nAnsprechpartner: Alex Weber":"Für diese Ressource ist eine Einweisung nötig.\nEinweiser: Alex Weber",16,53,408,18);
        return p;
    }
    if(id=="25-takeover") {
        label(p,"Eine Übernahme beendet Mias Sitzung.",20,230,440,18,T::warning());
        button(p,"Übernehmen",20,289,440,54,T::warning());
        footer(p,"Nur mit entsprechender Berechtigung");return p;
    }
    if(id=="21-door-details"||id=="23-door-opened") {
        button(p,"Tür öffnen",20,234,440,55);
        button(p,"Entsperren",20,302,215,54,T::surfaceSecondary(),T::text());
        button(p,"Sperren",245,302,215,54,T::surfaceSecondary(),T::text());
        if(id=="23-door-opened")notice(p,"Türöffnung bestätigt");return p;
    }
    button(p,id=="12-project-selected"?"Projekt: Regalbau" : "Projekt auswählen (optional)",20,230,440,52,T::surfaceSecondary(),T::text());
    button(p,id=="13-active-details"?"Sitzung beenden":"Ressource verwenden",20,302,440,60,id=="13-active-details"?T::danger():T::primary());
    if(id=="13-active-details")button(p,"Absaugung einschalten",20,378,440,52,T::surfaceSecondary(),T::text());
    else label(p,"Für Start mit Projekt zuerst hier auswählen.",20,390,440,16,T::muted());
    return p;
}
lv_obj_t *prompt(const std::string &id) {
    auto *p=screen(true);logo(p);
    // Preserve the artwork while keeping text readable over its bright areas.
    box(p,12,138,456,278,T::surface());
    if(id=="02-scan-for-details") {
        button(p,"< Liste",20,84,110,42,T::surfaceSecondary(),T::text());
        label(p,"Lasercutter",20,154,440,28);label(p,"Verfügbar",20,192,440,18,T::success());
        label(p,"Bitte mit NFC-Karte\noder Tag anmelden",20,257,440,28);
        footer(p,"Nach der Anmeldung öffnen sich die Details");
    } else if(id=="33-no-resources") {
        label(p,"Keine Ressourcen",20,155,440,28);
        label(p,"Mit diesem Reader sind noch keine Ressourcen verknüpft.",20,214,440,20);
        label(p,"Bitte den Reader in der Attraccess Administration konfigurieren.",20,304,440,18,T::muted());
    } else {
        label(p,"Verbindung unterbrochen",20,156,440,24);
        label(p,"Anmeldung und Aktionen sind erst wieder möglich, wenn der Reader verbunden ist.",20,215,440,20);
        spinner(p,20,330);label(p,"Verbindung wird hergestellt ...",74,340,375,16,T::muted());
    }return p;
}
lv_obj_t *form(const std::string &id) {
    auto *p=screen();header(p,30,true);label(p,"Vor der Nutzung",20,91,440,28);
    label(p,"Lasercutter · Sicherheitscheck · 1/1",20,134,440,16,T::muted());
    auto *o=box(p,20,177,440,126,T::surface());
    label(o,"Absaugung und Arbeitsbereich geprüft?",16,16,408,20);
    button(o,id=="15-form-ready"?"Bestätigt":"Bestätigen",16,68,408,42,id=="15-form-ready"?T::success():T::surfaceSecondary(),id=="15-form-ready"?T::onPrimary():T::text());
    if(id=="16-form-validation")label(p,"Bitte die Sicherheitsprüfung bestätigen.",20,322,440,16,T::danger());
    button(p,"Abbrechen",20,390,166,58,T::surfaceSecondary(),T::text());
    button(p,"Starten",196,390,264,58,id=="15-form-ready"?T::primary():T::surfaceSecondary(),id=="15-form-ready"?T::onPrimary():T::muted());
    return p;
}
lv_obj_t *supervision(const std::string &id) {
    auto *p=screen();header(p,30,true);label(p,"Aufsicht erforderlich",20,96,440,28);
    label(p,"Lasercutter · jappy",20,141,440,18,T::muted());
    if(id=="18-supervisor-checking") {spinner(p,221,220);label(p,"Aufsicht wird geprüft ...",40,291,400,24);}
    else if(id=="19-supervisor-rejected") {
        label(p,"Keine gültige Aufsicht",20,214,440,24,T::danger());
        label(p,"Bitte eine berechtigte Person bitten, ihre NFC-Karte aufzulegen.",20,264,440,20);
    } else {
        label(p,"Aufsicht: bitte NFC-Karte\nauflegen und halten",20,214,440,26);
        label(p,"Die Nutzung startet erst nach der Freigabe.",20,297,440,18,T::muted());
    }
    button(p,"Abbrechen",20,390,440,58,T::surfaceSecondary(),T::text());return p;
}
lv_obj_t *failure(const std::string &id) {
    bool auth=id=="05-auth-rejected";
    auto *p=list(auth?"01-home":"04-authenticated");overlay(p);
    auto *o=box(p,30,115,420,278,T::surface());
    label(o,auth?"Anmeldung fehlgeschlagen":"Start nicht bestätigt",18,22,384,24,T::danger());
    label(o,auth?"Karte nicht erkannt oder nicht berechtigt. Bitte erneut anmelden.":"Die Anfrage wurde nicht bestätigt. Der Ressourcenstatus wird erneut geladen.",18,77,384,20);
    button(o,auth?"Zurück":"Status neu laden",18,198,384,54);return p;
}
lv_obj_t *project() {
    auto *p=screen();header(p);label(p,"Projekt auswählen",20,96,440,28);
    label(p,"Lasercutter",20,138,440,18,T::muted());
    button(p,"Ohne Projekt",20,192,440,58,T::surfaceSecondary(),T::text());
    button(p,"Regalbau",20,262,440,58,T::surfaceSecondary(),T::text());
    button(p,"Messe-Demonstrator",20,332,440,58,T::surfaceSecondary(),T::text());
    button(p,"Zurück",20,410,440,48,T::surfaceSecondary(),T::text());return p;
}

int main(int argc,char **argv) {
    if(argc!=2) {std::cerr<<"Usage: att880-prototype OUTPUT_DIR\n";return 2;}
    std::filesystem::path output=argv[1];std::filesystem::create_directories(output);
    lv_init();std::vector<uint16_t> buffer(480*480),pixels(480*480);
    auto *display=lv_display_create(480,480);lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers_with_stride(display,buffer.data(),nullptr,buffer.size()*2,960,LV_DISPLAY_RENDER_MODE_FULL);
    lv_display_set_user_data(display,&pixels);
    lv_display_set_flush_cb(display,[](lv_display_t *d,const lv_area_t *,uint8_t *data){
        auto &p=*static_cast<std::vector<uint16_t> *>(lv_display_get_user_data(d));
        memcpy(p.data(),data,p.size()*2);lv_display_flush_ready(d);
    });T::init(display);
    std::vector<std::string> ids={
        "01-home","02-scan-for-details","03-authenticating","04-authenticated","05-auth-rejected",
        "06-starting","07-started","08-stopping","09-stopped","10-details","11-project-picker",
        "12-project-selected","13-active-details","14-required-form","15-form-ready","16-form-validation",
        "17-supervisor-waiting","18-supervisor-checking","19-supervisor-rejected","20-action-error",
        "21-door-details","22-door-pending","23-door-opened","24-other-user","25-takeover",
        "26-no-introduction","27-maintenance","28-introduction-details","29-offline","30-expiring",
        "31-logged-out","32-expired","33-no-resources","34-one-resource"};
    for(const auto &id:ids) {
        auto *previous=lv_screen_active();lv_obj_t *p;
        if(id=="03-authenticating"||id=="06-starting"||id=="08-stopping"||id=="22-door-pending")p=busy(id);
        else if(id=="02-scan-for-details"||id=="29-offline"||id=="33-no-resources")p=prompt(id);
        else if(id=="05-auth-rejected"||id=="20-action-error")p=failure(id);
        else if(id=="11-project-picker")p=project();
        else if(id>="14-"&&id<"17-")p=form(id);
        else if(id>="17-"&&id<"20-")p=supervision(id);
        else if(id=="10-details"||id=="12-project-selected"||id=="13-active-details"||id=="21-door-details"||id=="23-door-opened"||id=="25-takeover"||id=="27-maintenance"||id=="28-introduction-details")p=details(id);
        else p=list(id);
        lv_screen_load(p);lv_obj_delete(previous);
        for(int i=0;i<20;++i){lv_tick_inc(16);lv_timer_handler();}
        lv_obj_invalidate(p);lv_refr_now(display);
        std::ofstream file(output/(id+".rgba"),std::ios::binary);
        for(auto pixel:pixels){uint8_t r=(pixel>>11)&31,g=(pixel>>5)&63,b=pixel&31;uint8_t rgba[]={uint8_t((r<<3)|(r>>2)),uint8_t((g<<2)|(g>>4)),uint8_t((b<<3)|(b>>2)),255};file.write(reinterpret_cast<char *>(rgba),4);}
        std::cout<<id<<"\n";
    }
    lv_display_delete(display);lv_deinit();
}
